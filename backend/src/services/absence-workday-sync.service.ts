import { AppError } from "../errors/app-error";
import {
  absenceWorkdaySyncJobRepository,
  type AbsenceWorkdaySyncOperation,
} from "../repositories/absence-workday-sync-job.repository";
import type { AbsenceWorkdayReconciliationResult } from "../types/absence-workday-reconciliation";
import { absenceOperationImpactService } from "./absence-operation-impact.service";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";
import type sql from "mssql";

const SYNC_FAILED_MESSAGE =
  "La ausencia fue guardada, pero no se pudieron actualizar las jornadas programadas. La sincronización se reintentará automáticamente.";

const MAX_ATTEMPTS = 8;

const applyOperationalSideEffects = async (
  companyId: string,
  absenceRequestId: string,
  operation: AbsenceWorkdaySyncOperation | string,
): Promise<void> => {
  if (
    operation === "APPROVE" ||
    operation === "AUTO_APPROVE" ||
    operation === "RESUBMIT_AUTO_APPROVE" ||
    operation === "approve"
  ) {
    await absenceOperationImpactService.applyApprovedOperationalSideEffects(
      companyId,
      absenceRequestId,
    );
    return;
  }

  if (
    operation === "REJECT" ||
    operation === "CANCEL" ||
    operation === "reject" ||
    operation === "cancel"
  ) {
    await absenceOperationImpactService.revertOperationalSideEffects(
      companyId,
      absenceRequestId,
      `sync:${operation}`,
    );
  }
};

export const absenceWorkdaySyncService = {
  async enqueueInTransaction(
    input: {
      companyId: string;
      absenceRequestId: string;
      absenceStatus: string;
      operation: AbsenceWorkdaySyncOperation;
    },
    transaction: sql.Transaction,
  ): Promise<void> {
    await absenceWorkdaySyncJobRepository.enqueue(input, transaction);
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
      await applyOperationalSideEffects(companyId, absenceRequestId, context);

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

  async processPendingJobs(limit = 20): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < limit; i += 1) {
      const job = await absenceWorkdaySyncJobRepository.claimNextPending(MAX_ATTEMPTS);
      if (!job) {
        break;
      }

      try {
        if (
          job.operation === "APPROVE" ||
          job.operation === "AUTO_APPROVE" ||
          job.operation === "RESUBMIT_AUTO_APPROVE"
        ) {
          await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
            job.companyId,
            job.absenceRequestId,
          );
        } else {
          await employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
            job.companyId,
            job.absenceRequestId,
          );
        }
        await applyOperationalSideEffects(job.companyId, job.absenceRequestId, job.operation);
        await absenceWorkdaySyncJobRepository.markCompleted(job.companyId, job.id);
        processed += 1;
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

    return { processed, failed };
  },
};
