import { env } from "../config/env";
import { systemLogsService } from "../services/system-logs.service";
import { systemLogger } from "../utils/system-logs/logger";
import {
  beginJobLogContext,
  runWithRequestLogContextAsync,
} from "../utils/system-logs/request-log-context";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning || !env.SYSTEM_LOGS_RETENTION_JOB_ENABLED) {
    return;
  }
  isRunning = true;
  const ctx = beginJobLogContext("system-log-retention");
  try {
    await runWithRequestLogContextAsync(ctx, async () => {
      const result = await systemLogsService.runRetention();
      systemLogger.info({
        module: "system-log-retention",
        event: "system-log-retention.completed",
        message: "System runtime log retention completed",
        jobExecutionId: ctx.jobExecutionId,
        metadata: { deleted: result.deleted, batches: result.batches },
      });
    });
  } catch (error) {
    systemLogger.error({
      module: "system-log-retention",
      event: "system-log-retention.failed",
      message: "System runtime log retention failed",
      jobExecutionId: ctx.jobExecutionId,
      error,
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
