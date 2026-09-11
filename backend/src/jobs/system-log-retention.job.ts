import { env } from "../config/env";
import { systemLogsService } from "../services/system-logs.service";
import { systemLogger } from "../utils/system-logs/logger";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning || !env.SYSTEM_LOGS_RETENTION_JOB_ENABLED) {
    return;
  }
  isRunning = true;
  try {
    await runInstrumentedJobTick({
      module: "system-log-retention",
      jobName: "system-log-retention",
      completedEvent: "system-log-retention.completed",
      failedEvent: "system-log-retention.failed",
      completedMessage: "System runtime log retention completed",
      failedMessage: "System runtime log retention failed",
      run: async () => {
        const result = await systemLogsService.runRetention();
        if (result.lockSkipped) {
          systemLogger.info({
            module: "system-log-retention",
            event: "system-log-retention.skipped",
            message: "System log retention skipped (lease held by another replica)",
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
  } finally {
    isRunning = false;
  }
};

export const startSystemLogRetentionJob = (): void => {
  if (intervalHandle) {
    return;
  }
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.SYSTEM_LOGS_RETENTION_JOB_INTERVAL_MS);
};

export const stopSystemLogRetentionJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runSystemLogRetentionOnce = runJobSafely;
