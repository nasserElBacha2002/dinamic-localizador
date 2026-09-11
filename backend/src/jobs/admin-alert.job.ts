import { env } from "../config/env";
import { adminAlertDeliveryService } from "../services/admin-alert-delivery.service";
import { adminAlertReconciliationService } from "../services/admin-alert-reconciliation.service";
import { adminDynamicAttendanceAlertService } from "../services/admin-dynamic-attendance-alert.service";
import { attendanceThresholdAlertService } from "../services/attendance-threshold-alert.service";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[admin-alert-job] previous run still in progress, skipping tick");
    return;
  }
  if (!env.ADMIN_ALERT_WORKER_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    await runInstrumentedJobTick({
      module: "admin-alert",
      jobName: "admin-alert",
      completedEvent: "admin-alert.run.completed",
      failedEvent: "admin-alert.run.failed",
      completedMessage: "Admin alert worker tick completed",
      failedMessage: "Admin alert worker tick failed",
      run: async () => {
        const reconciliation = await adminAlertReconciliationService.reconcileAll();
        const dynamicAttendance = await adminDynamicAttendanceAlertService.reconcileDue(
          new Date(),
          { batchSize: env.ADMIN_ALERT_DYNAMIC_CANDIDATE_BATCH_SIZE },
        );
        const pendingThreshold =
          await attendanceThresholdAlertService.reconcilePendingCrossingAlerts();
        const evaluation = await attendanceThresholdAlertService.processEvaluationBatch();
        const result = await adminAlertDeliveryService.processPendingBatch(
          env.ADMIN_ALERT_DELIVERY_BATCH_SIZE,
        );
        return {
          reconciliationRecovered:
            reconciliation.unavailableRecovered +
            reconciliation.missingCheckinRecovered +
            reconciliation.pendingAbsenceRecovered,
          dynamicEnqueued: dynamicAttendance.enqueued,
          thresholdRecovered: pendingThreshold.recovered,
          evaluationClaimed: evaluation.claimed,
          deliveryProcessed: result.processed,
        };
      },
    });
  } finally {
    isRunning = false;
  }
};

export const startAdminAlertJob = (): void => {
  if (intervalHandle) {
    return;
  }
  if (!env.ADMIN_ALERT_WORKER_ENABLED) {
    console.info("[admin-alert-job] disabled by env");
    return;
  }
  console.info(
    `[admin-alert-job] starting scheduler (every ${env.ADMIN_ALERT_WORKER_INTERVAL_MS}ms)`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.ADMIN_ALERT_WORKER_INTERVAL_MS);
};

export const stopAdminAlertJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runAdminAlertJobOnce = async (): Promise<void> => {
  await runJobSafely();
};
