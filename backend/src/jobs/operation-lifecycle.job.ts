import { env } from "../config/env";
import { operationLifecycleService } from "../services/operation-lifecycle.service";

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
  const startedAt = Date.now();
  try {
    console.info("[operation-lifecycle-job] job_started");
    const result = await operationLifecycleService.reconcileDue();
    console.info("[operation-lifecycle-job] tick complete", {
      batch_size: env.OPERATION_LIFECYCLE_JOB_BATCH_SIZE,
      operations_scanned: result.operationsScanned,
      operations_updated: result.operationsUpdated,
      operations_skipped: result.operationsSkipped,
      operations_failed: result.operationsFailed,
      duration_ms: result.durationMs,
      backlog_remaining: result.backlogRemaining,
      wall_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[operation-lifecycle-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startedAt,
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
