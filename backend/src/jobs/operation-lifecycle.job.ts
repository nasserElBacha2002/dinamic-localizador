import { env } from "../config/env";
import { operationLifecycleService } from "../services/operation-lifecycle.service";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";

let intervalHandle: NodeJS.Timeout | null = null;
/** Per-process overlap guard only. Multiple backend instances may run this job
 * at once; `promoteLifecycleStatus` CAS is the cross-instance integrity gate. */
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[operation-lifecycle-job] previous run still in progress, skipping tick");
    return;
  }
  if (!env.OPERATION_LIFECYCLE_JOB_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    await runInstrumentedJobTick({
      module: "operation-lifecycle",
      jobName: "operation-lifecycle",
      completedEvent: "operation-lifecycle.run.completed",
      failedEvent: "operation-lifecycle.run.failed",
      completedMessage: "Operation lifecycle tick completed",
      failedMessage: "Operation lifecycle job failed",
      run: async () => {
        const result = await operationLifecycleService.reconcileDue();
        return {
          operationsScanned: result.operationsScanned,
          operationsUpdated: result.operationsUpdated,
          operationsSkipped: result.operationsSkipped,
          operationsFailed: result.operationsFailed,
          backlogRemaining: result.backlogRemaining,
        };
      },
    });
  } finally {
    isRunning = false;
  }
};

export const startOperationLifecycleJob = (): void => {
  if (!env.OPERATION_LIFECYCLE_JOB_ENABLED) {
    console.info(
      "[operation-lifecycle-job] job not started because OPERATION_LIFECYCLE_JOB_ENABLED=false",
    );
    return;
  }

  if (intervalHandle) {
    return;
  }

  console.info(
    `[operation-lifecycle-job] starting scheduler (every ${env.OPERATION_LIFECYCLE_JOB_INTERVAL_MS}ms)`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.OPERATION_LIFECYCLE_JOB_INTERVAL_MS);
};

export const stopOperationLifecycleJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runOperationLifecycleJobOnce = async (): Promise<void> => {
  await runJobSafely();
};
