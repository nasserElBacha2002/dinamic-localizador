import { env } from "../config/env";
import { payrollReceiptNotificationService } from "../services/payroll-receipt-notification.service";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info(
      "[payroll-receipt-notification-job] previous run still in progress, skipping tick",
    );
    return;
  }
  if (!env.PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    const result = await payrollReceiptNotificationService.processPendingBatch(25);
    if (result.processed > 0) {
      console.info("[payroll-receipt-notification-job] tick complete", result);
    }
  } catch (error) {
    console.error("[payroll-receipt-notification-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startPayrollReceiptNotificationJob = (): void => {
  if (intervalHandle) {
    return;
  }
  if (!env.PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED) {
    console.info("[payroll-receipt-notification-job] disabled by env");
    return;
  }
  console.info(
    `[payroll-receipt-notification-job] starting scheduler (every ${env.PAYROLL_RECEIPT_NOTIFICATION_WORKER_INTERVAL_MS}ms)`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.PAYROLL_RECEIPT_NOTIFICATION_WORKER_INTERVAL_MS);
};

export const stopPayrollReceiptNotificationJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runPayrollReceiptNotificationJobOnce = async (): Promise<void> => {
  await runJobSafely();
};
