import { AppError } from "../errors/app-error";
import {
  absenceWorkdaySyncJobRepository,
  type AbsenceWorkdaySyncOperation,
} from "../repositories/absence-workday-sync-job.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AbsenceWorkdayReconciliationResult } from "../types/absence-workday-reconciliation";
import { absenceOperationalReconciliationService } from "./absence-operational-reconciliation.service";
import type sql from "mssql";

const SYNC_FAILED_MESSAGE =
  "La ausencia fue guardada, pero no se pudieron actualizar las jornadas programadas. La sincronización se reintentará automáticamente.";

const MAX_ATTEMPTS = 8;

export const absenceWorkdaySyncService = {
  async enqueueInTransaction(
    input: {
      companyId: string;
      absenceRequestId: string;
      absenceStatus: string;
      operation: AbsenceWorkdaySyncOperation;
      expectedOperationalImpactVersion?: number;
    },
    transaction: sql.Transaction,
  ): Promise<void> {
    let version = input.expectedOperationalImpactVersion;
    if (version == null) {
      const request = await absenceRequestRepository.findById(
        input.companyId,
        input.absenceRequestId,
      );
      version = request?.operationalImpactVersion ?? 1;
    }
    await absenceOperationalReconciliationService.enqueueInTransaction(
      {
        companyId: input.companyId,
        absenceRequestId: input.absenceRequestId,
        absenceStatus: input.absenceStatus,
        operation: input.operation,
        expectedOperationalImpactVersion: version,
      },
      transaction,
    );
  },

  async runAfterAbsenceMutation<T extends { workdayReconciliation?: AbsenceWorkdayReconciliationResult }>(
    companyId: string,
    absenceRequestId: string,
    loadResult: () => Promise<T>,
    reconcile: () => Promise<AbsenceWorkdayReconciliationResult>,
    context: string,
  ): Promise<T & { workdayReconciliation: AbsenceWorkdayReconciliationResult }> {
    const result = await loadResult();

    try {
      const workdayReconciliation = await reconcile();
      // Post-reconciliation operational effects (conflicts) — no business branching here.
      if (context === "approve") {
        await absenceOperationalReconciliationService.applyApprovedOperationalSideEffects(
          companyId,
          absenceRequestId,
        );
      } else if (context === "reject" || context === "cancel") {
        await absenceOperationalReconciliationService.revertOperationalSideEffects(
          companyId,
          absenceRequestId,
          `sync:${context}`,
        );
      }

      try {
        const active = await absenceWorkdaySyncJobRepository.findActiveByRequest(
          companyId,
          absenceRequestId,
        );
        if (
          active &&
          (active.status === "PENDING" ||
            active.status === "PROCESSING" ||
            active.status === "FAILED")
        ) {
          await absenceWorkdaySyncJobRepository.markCompleted(companyId, active.id);
        }
      } catch (jobError) {
        console.error("[absence-workday-sync] mark completed skipped", {
          companyId,
          absenceRequestId,
          error: jobError instanceof Error ? jobError.message : String(jobError),
        });
      }
      return { ...result, workdayReconciliation };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[absence-workday-sync] ${context} failed`, {
        companyId,
        absenceRequestId,
        error: message,
      });

      try {
        const active = await absenceWorkdaySyncJobRepository.findActiveByRequest(
          companyId,
          absenceRequestId,
        );
        if (active) {
          await absenceWorkdaySyncJobRepository.markFailedAttempt(
            companyId,
            active.id,
            message,
            MAX_ATTEMPTS,
          );
        }
      } catch (jobError) {
        console.error("[absence-workday-sync] mark failed attempt skipped", {
          companyId,
          absenceRequestId,
          error: jobError instanceof Error ? jobError.message : String(jobError),
        });
      }

      if (error instanceof AppError && error.code === "ABSENCE_WORKDAY_SYNC_FAILED") {
        throw error;
      }
      throw new AppError(503, "ABSENCE_WORKDAY_SYNC_FAILED", SYNC_FAILED_MESSAGE, {
        absenceRequestId,
        pendingSync: true,
      });
    }
  },

  async processPendingJobs(limit = 20): Promise<{ processed: number; failed: number; superseded: number }> {
    let processed = 0;
    let failed = 0;
    let superseded = 0;

    for (let i = 0; i < limit; i += 1) {
      const job = await absenceWorkdaySyncJobRepository.claimNextPending(MAX_ATTEMPTS);
      if (!job) {
        break;
      }

      try {
        const outcome =
          await absenceOperationalReconciliationService.executeClaimedJob(job);
        if (outcome === "SUPERSEDED") {
          superseded += 1;
        } else {
          await absenceWorkdaySyncJobRepository.markCompleted(job.companyId, job.id);
          processed += 1;
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[absence-workday-sync] pending job failed", {
          companyId: job.companyId,
          absenceRequestId: job.absenceRequestId,
          jobId: job.id,
          operation: job.operation,
          error: message,
        });
        await absenceWorkdaySyncJobRepository.markFailedAttempt(
          job.companyId,
          job.id,
          message,
          MAX_ATTEMPTS,
        );
      }
    }

    return { processed, failed, superseded };
  },
};
