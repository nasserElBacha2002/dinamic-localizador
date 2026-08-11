import { env } from "../config/env";
import { operationAssignmentNotificationService } from "../services/operation-assignment-notification.service";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info(
      "[operation-assignment-notification-job] previous run still in progress, skipping tick",
    );
    return;
  }
  if (!env.OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    const result = await operationAssignmentNotificationService.processPendingBatch(5);
    if (result.processed > 0) {
      console.info("[operation-assignment-notification-job] tick complete", result);
    }
  } catch (error) {
    console.error("[operation-assignment-notification-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startOperationAssignmentNotificationJob = (): void => {
  if (intervalHandle) {
    return;
  }
  if (!env.OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED) {
    console.info("[operation-assignment-notification-job] disabled by env");
    return;
  }
  console.info(
    `[operation-assignment-notification-job] starting scheduler (every ${env.OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_INTERVAL_MS}ms)`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_INTERVAL_MS);
};

export const stopOperationAssignmentNotificationJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runOperationAssignmentNotificationJobOnce = async (): Promise<void> => {
  await runJobSafely();
};
