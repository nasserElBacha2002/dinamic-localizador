import { env } from "../config/env";
import { adminAlertDeliveryService } from "../services/admin-alert-delivery.service";
import { adminAlertReconciliationService } from "../services/admin-alert-reconciliation.service";
import { adminDynamicAttendanceAlertService } from "../services/admin-dynamic-attendance-alert.service";
import { attendanceThresholdAlertService } from "../services/attendance-threshold-alert.service";
import { systemLogger } from "../utils/system-logs/logger";

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
    const reconciliation = await adminAlertReconciliationService.reconcileAll();
    if (
      reconciliation.unavailableRecovered > 0 ||
      reconciliation.missingCheckinRecovered > 0 ||
      reconciliation.pendingAbsenceRecovered > 0
    ) {
      console.info("[admin-alert-job] reconciliation recovered pending alerts", reconciliation);
    }

    const dynamicAttendance = await adminDynamicAttendanceAlertService.reconcileDue(
      new Date(),
      { batchSize: env.ADMIN_ALERT_DYNAMIC_CANDIDATE_BATCH_SIZE },
    );
    if (
      dynamicAttendance.enqueued > 0 ||
      dynamicAttendance.expired > 0 ||
      dynamicAttendance.evaluated > 0
    ) {
      console.info("[admin-alert-job] dynamic attendance alerts", dynamicAttendance);
    }

    const pendingThreshold =
      await attendanceThresholdAlertService.reconcilePendingCrossingAlerts();
    if (pendingThreshold.recovered > 0) {
      console.info(
        "[admin-alert-job] attendance threshold pending alerts recovered",
        pendingThreshold,
      );
    }

    const evaluation = await attendanceThresholdAlertService.processEvaluationBatch();
    if (evaluation.claimed > 0) {
      console.info("[admin-alert-job] attendance threshold evaluation", evaluation);
    }

    const result = await adminAlertDeliveryService.processPendingBatch(
      env.ADMIN_ALERT_DELIVERY_BATCH_SIZE,
    );
    console.info("[admin-alert-job] tick complete", result);
  } catch (error) {
    systemLogger.error({
      module: "admin-alert",
      event: "admin-alert.run.failed",
      message: "Admin alert worker tick failed",
      error,
    });
    console.error("[admin-alert-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
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
