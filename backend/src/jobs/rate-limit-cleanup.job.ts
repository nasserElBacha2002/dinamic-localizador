import { env } from "../config/env";
import { rateLimitCleanupService } from "../services/rate-limit-cleanup.service";
import { systemLogger } from "../utils/system-logs/logger";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";

let intervalHandle: NodeJS.Timeout | null = null;

const runJobSafely = async (): Promise<void> => {
  if (!env.RATE_LIMIT_CLEANUP_JOB_ENABLED) {
    return;
  }

  try {
    await runInstrumentedJobTick({
      module: "rate-limit-cleanup",
      jobName: "rate-limit-cleanup",
      completedEvent: "rate-limit-cleanup.completed",
      failedEvent: "rate-limit-cleanup.failed",
      completedMessage: "Rate-limit bucket cleanup completed",
      failedMessage: "Rate-limit bucket cleanup failed",
      run: async () => {
        const result = await rateLimitCleanupService.runCleanup();
        if (result.lockSkipped) {
          systemLogger.info({
            module: "rate-limit-cleanup",
            event: "rate-limit-cleanup.skipped",
            message: "Rate-limit cleanup skipped (lease held by another replica)",
            metadata: { lockSkipped: true },
          });
          return { __skipCompleted: true, lockSkipped: true, deleted: 0, batches: 0 };
        }
        return {
          lockSkipped: false,
          deleted: result.deleted,
          batches: result.batches,
        };
      },
    });
  } catch (error) {
    console.error("[rate-limit-cleanup] unexpected job error", {
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
};

export const startRateLimitCleanupJob = (): void => {
  if (intervalHandle) {
    return;
  }
  if (!env.RATE_LIMIT_CLEANUP_JOB_ENABLED) {
    return;
  }
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.RATE_LIMIT_CLEANUP_JOB_INTERVAL_MS);
};

export const stopRateLimitCleanupJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runRateLimitCleanupOnce = runJobSafely;
