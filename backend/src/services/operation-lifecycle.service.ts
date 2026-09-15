import { env } from "../config/env";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { Operation } from "../types/domain";
import type { OperationWorkday } from "../types/workday";
import { canTransitionOperationLifecycleStatus } from "../utils/operation-status";
import {
  hasActiveFutureOrInProgressWorkday,
  resolveOperationLifecycleStatusForMode,
} from "../utils/multi-shift-lifecycle";
import { markMissingCheckinEmployeesDirtyForThreshold } from "./attendance-threshold-completed-operation.service";

export type OperationLifecycleReconcileResult = {
  operationsScanned: number;
  operationsUpdated: number;
  operationsSkipped: number;
  operationsFailed: number;
  batches: number;
  durationMs: number;
  backlogRemaining: number;
};

class OperationLifecycleItemError extends Error {
  constructor(
    readonly companyId: string,
    readonly operation: Operation,
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "OperationLifecycleItemError";
  }
}

const loadWorkdaysIfMulti = async (
  companyId: string,
  operation: Operation,
): Promise<OperationWorkday[] | null> => {
  if (operation.scheduleMode !== "MULTI_SHIFT") {
    return null;
  }
  return operationWorkdayRepository.listByOperationId(companyId, operation.id);
};

const promoteIfDue = async (
  companyId: string,
  operation: Operation,
  at: Date,
): Promise<"updated" | "skipped"> => {
  const workdays = await loadWorkdaysIfMulti(companyId, operation);
  let nextStatus = resolveOperationLifecycleStatusForMode(operation, workdays, at);

  // Defensive: MULTI ONE_TIME must never COMPLETE while an ACTIVE workday is open.
  if (
    nextStatus === "COMPLETED" &&
    operation.scheduleMode === "MULTI_SHIFT" &&
    (operation.operationKind ?? "ONE_TIME") === "ONE_TIME" &&
    workdays &&
    hasActiveFutureOrInProgressWorkday(workdays, at)
  ) {
    nextStatus = "IN_PROGRESS";
  }

  if (nextStatus === operation.status) {
    return "skipped";
  }
  if (!canTransitionOperationLifecycleStatus(operation.status, nextStatus)) {
    return "skipped";
  }

  const updated = await operationRepository.promoteLifecycleStatus(
    companyId,
    operation.id,
    operation.status,
    nextStatus,
  );
  if (updated && nextStatus === "COMPLETED") {
    try {
      await markMissingCheckinEmployeesDirtyForThreshold(companyId, updated.id);
    } catch (error) {
      // Promotion already committed; dirty-mark is best-effort with structured logs.
      // Failing the lifecycle item would mis-count a successful COMPLETED transition.
      console.error("[operation-lifecycle] threshold dirty mark failed", {
        companyId,
        operationId: updated.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return updated ? "updated" : "skipped";
};

export const operationLifecycleService = {
  /**
   * Read-path sync (GET/list). On CAS miss, re-read the persisted row once so
   * callers never observe the pre-promotion status after a concurrent win.
   */
  async syncPersistedStatus(
    companyId: string,
    operation: Operation,
    at: Date = new Date(),
  ): Promise<Operation> {
    const workdays = await loadWorkdaysIfMulti(companyId, operation);
    let nextStatus = resolveOperationLifecycleStatusForMode(operation, workdays, at);

    if (
      nextStatus === "COMPLETED" &&
      operation.scheduleMode === "MULTI_SHIFT" &&
      (operation.operationKind ?? "ONE_TIME") === "ONE_TIME" &&
      workdays &&
      hasActiveFutureOrInProgressWorkday(workdays, at)
    ) {
      nextStatus = "IN_PROGRESS";
    }

    if (nextStatus === operation.status) {
      return operation;
    }
    if (!canTransitionOperationLifecycleStatus(operation.status, nextStatus)) {
      return operation;
    }

    const updated = await operationRepository.promoteLifecycleStatus(
      companyId,
      operation.id,
      operation.status,
      nextStatus,
    );
    if (updated) {
      return updated;
    }

    // CAS miss: another request/instance already wrote. Re-read once; never loop.
    const persisted = await operationRepository.findById(companyId, operation.id);
    return persisted ?? operation;
  },

  async reconcileDue(options?: {
    now?: Date;
    batchSize?: number;
    maxBatches?: number;
  }): Promise<OperationLifecycleReconcileResult> {
    const now = options?.now ?? new Date();
    const startedAt = Date.now();
    const batchSize = options?.batchSize ?? env.OPERATION_LIFECYCLE_JOB_BATCH_SIZE;
    const maxBatches = options?.maxBatches ?? env.OPERATION_LIFECYCLE_JOB_MAX_BATCHES_PER_TICK;

    let operationsScanned = 0;
    let operationsUpdated = 0;
    let operationsSkipped = 0;
    let operationsFailed = 0;
    let batches = 0;
    let afterSortKey: Date | null = null;
    let afterId: string | null = null;

    while (batches < maxBatches) {
      const due = await operationRepository.listOneTimeLifecycleDue({
        now,
        limit: batchSize,
        afterSortKey,
        afterId,
      });
      if (due.length === 0) {
        break;
      }

      batches += 1;
      operationsScanned += due.length;

      const outcomes = await Promise.allSettled(
        due.map(async ({ companyId, operation }) => {
          try {
            const outcome = await promoteIfDue(companyId, operation, now);
            return { companyId, operation, outcome };
          } catch (error) {
            throw new OperationLifecycleItemError(companyId, operation, error);
          }
        }),
      );

      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          if (outcome.value.outcome === "updated") {
            operationsUpdated += 1;
          } else {
            operationsSkipped += 1;
          }
          continue;
        }

        operationsFailed += 1;
        const reason = outcome.reason;
        const itemError =
          reason instanceof OperationLifecycleItemError ? reason : null;
        const operation = itemError?.operation;
        const expectedStatus = operation
          ? resolveOperationLifecycleStatusForMode(operation, null, now)
          : null;
        console.error("[operation-lifecycle] reconcile failed", {
          operationId: operation?.id ?? null,
          companyId: itemError?.companyId ?? null,
          currentStatus: operation?.status ?? null,
          expectedStatus,
          error: itemError?.message ?? String(reason),
        });
      }

      // Keyset: always advance past the last selected row (success, skip, or poison)
      // so a failing row cannot starve later due rows in this tick. Next tick
      // starts from the beginning and retries leftover poison.
      const last = due.at(-1);
      if (!last) {
        break;
      }
      afterSortKey = last.sortKey;
      afterId = last.operation.id;
    }

    const backlogRemaining = await operationRepository.countOneTimeLifecycleDue(now);

    return {
      operationsScanned,
      operationsUpdated,
      operationsSkipped,
      operationsFailed,
      batches,
      durationMs: Date.now() - startedAt,
      backlogRemaining,
    };
  },
};
