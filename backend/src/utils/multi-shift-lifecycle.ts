import type { Operation } from "../types/domain";
import type { OperationWorkday } from "../types/workday";
import type { OperationStatus } from "./operation-status";
import { getOperationEffectiveEnd, resolveLifecycleOperationStatus } from "./operation-lifecycle";

/** ACTIVE workday still future or in progress at `at`. */
export const hasActiveFutureOrInProgressWorkday = (
  workdays: OperationWorkday[],
  at: Date,
): boolean =>
  workdays.some((workday) => {
    if (workday.status !== "ACTIVE") {
      return false;
    }
    const start = new Date(workday.expectedStartAt);
    if (start > at) {
      return true;
    }
    if (workday.expectedEndAt == null) {
      // Missing end must not block forever without observability — treat as in-progress.
      return true;
    }
    return new Date(workday.expectedEndAt) > at;
  });

/**
 * MULTI_SHIFT ONE_TIME lifecycle from materialized workdays (not legacy scheduled_* alone).
 * RECURRING MULTI never auto-completes here — callers keep recurrence validity rules.
 */
export const resolveMultiShiftOneTimeLifecycleStatus = (
  workdays: OperationWorkday[],
  at: Date,
  fallback: OperationStatus,
): OperationStatus => {
  if (fallback === "CANCELLED") {
    return "CANCELLED";
  }

  const relevant = workdays.filter((row) => row.status === "ACTIVE" || row.status === "CANCELLED");
  if (relevant.length === 0) {
    return fallback === "COMPLETED" ? "COMPLETED" : "SCHEDULED";
  }

  const active = relevant.filter((row) => row.status === "ACTIVE");
  if (active.length === 0) {
    // All materialized days cancelled → COMPLETED for ONE_TIME multi.
    return "COMPLETED";
  }

  const anyStarted = active.some((row) => new Date(row.expectedStartAt) <= at);
  const anyOpen = hasActiveFutureOrInProgressWorkday(active, at);

  if (!anyStarted && anyOpen) {
    return "SCHEDULED";
  }
  if (anyOpen) {
    return "IN_PROGRESS";
  }
  return "COMPLETED";
};

export const resolveOperationLifecycleStatusForMode = (
  operation: Pick<
    Operation,
    | "operationKind"
    | "status"
    | "scheduleMode"
    | "scheduledStart"
    | "scheduledEnd"
    | "earlyToleranceMinutes"
    | "lateToleranceMinutes"
  >,
  workdays: OperationWorkday[] | null,
  at: Date = new Date(),
): OperationStatus => {
  if (operation.status === "CANCELLED" || operation.status === "COMPLETED") {
    return operation.status;
  }

  if (operation.scheduleMode === "MULTI_SHIFT") {
    if ((operation.operationKind ?? "ONE_TIME") === "RECURRING") {
      return operation.status === "IN_PROGRESS" ? "IN_PROGRESS" : "SCHEDULED";
    }
    return resolveMultiShiftOneTimeLifecycleStatus(
      workdays ?? [],
      at,
      resolveLifecycleOperationStatus(operation, at),
    );
  }

  return resolveLifecycleOperationStatus(operation, at);
};

export { getOperationEffectiveEnd };
