import { AppError } from "../errors/app-error";
import {
  absenceWorkdaySyncJobRepository,
  type AbsenceWorkdaySyncOperation,
  type JobLeaseToken,
} from "../repositories/absence-workday-sync-job.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AbsenceWorkdayReconciliationResult } from "../types/absence-workday-reconciliation";
import { absenceOperationalReconciliationService } from "./absence-operational-reconciliation.service";
import type sql from "mssql";

const SYNC_FAILED_MESSAGE =
  "La ausencia fue guardada, pero no se pudieron actualizar las jornadas programadas. La sincronización se reintentará automáticamente.";

const MAX_ATTEMPTS = 8;
const LEASE_SECONDS = 180;
const RECOVERY_BATCH = 50;

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
          (active.status === "PENDING" || active.status === "FAILED")
        ) {
          await absenceWorkdaySyncJobRepository.completeInlineJob(companyId, active.id);
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
        if (active && (active.status === "PENDING" || active.status === "FAILED")) {
          await absenceWorkdaySyncJobRepository.failInlineJob(
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

  async processPendingJobs(limit = 20): Promise<{
    processed: number;
    failed: number;
    superseded: number;
    leaseLost: number;
    recovered: number;
  }> {
    let processed = 0;
    let failed = 0;
    let superseded = 0;
    let leaseLost = 0;

    const recovered = await absenceWorkdaySyncJobRepository.recoverExpiredLeases(
      RECOVERY_BATCH,
      MAX_ATTEMPTS,
    );

    for (let i = 0; i < limit; i += 1) {
      const job = await absenceWorkdaySyncJobRepository.claimNextPending(MAX_ATTEMPTS, {
        leaseOwner: `absence-sync-${process.pid}-${i}-${Date.now()}`,
        leaseSeconds: LEASE_SECONDS,
      });
      if (!job) {
        break;
      }

      const token: JobLeaseToken = absenceWorkdaySyncJobRepository.toLeaseToken(job);

      try {
        const outcome =
          await absenceOperationalReconciliationService.executeClaimedJob(job, token);
        if (outcome === "SUPERSEDED") {
          superseded += 1;
        } else if (outcome === "LEASE_LOST") {
          leaseLost += 1;
        } else {
          await absenceWorkdaySyncJobRepository.markCompletedWithLease(token);
          processed += 1;
        }
      } catch (error) {
        if (error instanceof AppError && error.code === "JOB_LEASE_LOST") {
          leaseLost += 1;
          continue;
        }
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error("[absence-workday-sync] pending job failed", {
          companyId: job.companyId,
          absenceRequestId: job.absenceRequestId,
          jobId: job.id,
          operation: job.operation,
          error: message,
        });
        try {
          await absenceWorkdaySyncJobRepository.markFailedAttemptWithLease(
            token,
            message,
            MAX_ATTEMPTS,
          );
        } catch (leaseError) {
          if (!(leaseError instanceof AppError && leaseError.code === "JOB_LEASE_LOST")) {
            throw leaseError;
          }
          leaseLost += 1;
        }
      }
    }

    return { processed, failed, superseded, leaseLost, recovered };
  },
};
