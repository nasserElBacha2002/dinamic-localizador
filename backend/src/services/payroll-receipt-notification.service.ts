import { env } from "../config/env";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS } from "../constants/payroll-receipt-notification";
import { companyModuleService } from "./company-module.service";
import { employeeRepository } from "../repositories/employee.repository";
import { payrollReceiptNotificationRepository } from "../repositories/payroll-receipt-notification.repository";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { PayrollReceiptNotification } from "../types/payroll-receipt-notification";
import { buildPayrollReceiptAvailableTemplateVariables } from "../utils/payroll-receipts/available-template-variables";
import { payrollReceiptMetrics } from "../utils/payroll-receipts/metrics";
import { twilioOutboundService } from "./twilio-outbound.service";

const isRetryableTwilioError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return true;
  }
  const message = error.message.toUpperCase();
  if (
    message.includes("NOT_CONFIGURED") ||
    message.includes("CONTENT_SID") ||
    message.includes("INVALID") ||
    message.includes("21211") || // Invalid 'To' phone
    message.includes("21610") // Unsubscribed
  ) {
    return false;
  }
  return true;
};

const computeNextAttemptAt = (attemptCount: number): Date => {
  const baseMs = env.PAYROLL_RECEIPT_NOTIFICATION_RETRY_BASE_MS;
  const delayMs = baseMs * Math.pow(2, Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMs);
};

const processClaimedNotification = async (
  notification: PayrollReceiptNotification,
): Promise<"sent" | "cancelled" | "failed" | "recovery"> => {
  const receipt = await payrollReceiptRepository.findById(
    notification.companyId,
    notification.payrollReceiptId,
  );

  if (
    !receipt ||
    receipt.status !== "ASSOCIATED" ||
    receipt.deletedAt ||
    !receipt.storageObjectKey ||
    !receipt.employeeId
  ) {
    await payrollReceiptNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "OBSOLETE",
      errorMessage: "Receipt is no longer ASSOCIATED or missing storage",
    });
    payrollReceiptMetrics.notificationCancelled({ status: "OBSOLETE" });
    return "cancelled";
  }

  const moduleStates = await companyModuleService.getModuleStates(notification.companyId);
  if (moduleStates.get(COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS) !== true) {
    await payrollReceiptNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "MODULE_DISABLED",
      errorMessage: "payroll_receipts module disabled",
    });
    payrollReceiptMetrics.notificationCancelled({ status: "MODULE_DISABLED" });
    return "cancelled";
  }

  const employee = await employeeRepository.findById(
    notification.companyId,
    receipt.employeeId,
  );
  // Inactive employees may still receive historical receipt notices if phone is valid.
  if (!employee || !employee.phoneNumber?.trim()) {
    await payrollReceiptNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "EMPLOYEE_UNAVAILABLE",
      errorMessage: "Employee missing or phone empty",
    });
    payrollReceiptMetrics.notificationCancelled({ status: "EMPLOYEE_UNAVAILABLE" });
    return "cancelled";
  }

  const contentSid = env.TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID?.trim();
  if (!contentSid) {
    await payrollReceiptNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CONFIG",
      errorMessage: "TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID is not configured",
      nextAttemptAt: null,
      permanent: true,
    });
    payrollReceiptMetrics.notificationFailed({ errorCode: "CONFIG" });
    return "failed";
  }

  const contentVariables = buildPayrollReceiptAvailableTemplateVariables({
    employeeName: employee.name,
    year: receipt.year,
    month: receipt.month,
  });

  try {
    const result = await twilioOutboundService.sendWhatsAppTemplate({
      toPhoneNumber: employee.phoneNumber,
      contentSid,
      contentVariables,
    });

    try {
      await whatsappMessageRepository.create({
        companyId: notification.companyId,
        messageSid: result.messageSid,
        direction: "OUTBOUND",
        employeeId: employee.id,
        phoneFrom: env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+00000000000",
        phoneTo: employee.phoneNumber,
        messageType: "TEXT",
        body: `[TEMPLATE:PAYROLL_RECEIPT_AVAILABLE]`,
        latitude: null,
        longitude: null,
        status: "SENT",
        rawPayload: null,
      });
    } catch (obsError) {
      console.warn("[payroll-receipt-notification] outbound message persist failed (non-blocking)", {
        notificationId: notification.id,
        error: obsError instanceof Error ? obsError.message : String(obsError),
      });
    }

    try {
      await payrollReceiptNotificationRepository.markSent({
        companyId: notification.companyId,
        notificationId: notification.id,
        providerMessageSid: result.messageSid,
      });
      payrollReceiptMetrics.notificationSent({ status: "SENT" });
      return "sent";
    } catch (markSentError) {
      const errorMessage =
        markSentError instanceof Error ? markSentError.message : "Unknown markSent error";
      try {
        await payrollReceiptNotificationRepository.markSentRecoveryRequired({
          companyId: notification.companyId,
          notificationId: notification.id,
          providerMessageSid: result.messageSid,
          errorMessage,
        });
        payrollReceiptMetrics.notificationFailed({ errorCode: "MARK_SENT_FAILED" });
        return "recovery";
      } catch {
        console.error("[payroll-receipt-notification] markSent recovery failed", {
          notificationId: notification.id,
          error: errorMessage,
        });
        payrollReceiptMetrics.notificationFailed({ errorCode: "MARK_SENT_RECOVERY_FAILED" });
        return "recovery";
      }
    }
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
    const maxAttempts =
      env.PAYROLL_RECEIPT_NOTIFICATION_MAX_ATTEMPTS ??
      PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS;
    const retryable = isRetryableTwilioError(sendError);
    const exhausted = notification.attemptCount >= maxAttempts;

    if (!retryable || exhausted) {
      await payrollReceiptNotificationRepository.markFailed({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: retryable ? "SEND_EXHAUSTED" : "SEND_PERMANENT",
        errorMessage,
        nextAttemptAt: null,
        permanent: true,
      });
      payrollReceiptMetrics.notificationFailed({
        errorCode: retryable ? "SEND_EXHAUSTED" : "SEND_PERMANENT",
      });
      return "failed";
    }

    await payrollReceiptNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "SEND_RETRYABLE",
      errorMessage,
      nextAttemptAt: computeNextAttemptAt(notification.attemptCount),
    });
    payrollReceiptMetrics.notificationRetried({ errorCode: "SEND_RETRYABLE" });
    return "failed";
  }
};

export const payrollReceiptNotificationService = {
  async processPendingBatch(limit = 25): Promise<{
    processed: number;
    sent: number;
    cancelled: number;
    failed: number;
    recovery: number;
  }> {
    const maxAttempts = env.PAYROLL_RECEIPT_NOTIFICATION_MAX_ATTEMPTS;
    await payrollReceiptNotificationRepository.recoverExpiredLeases(50, maxAttempts);

    const leaseSeconds = Math.max(
      30,
      Math.floor(env.PAYROLL_RECEIPT_NOTIFICATION_LEASE_MS / 1000),
    );
    const workerId = `payroll-receipt-notif-${process.pid}`;
    const claimed = await payrollReceiptNotificationRepository.claimNextBatch(
      workerId,
      limit,
      leaseSeconds,
      maxAttempts,
    );

    if (claimed.length > 0) {
      payrollReceiptMetrics.notificationClaimed({
        status: "PROCESSING",
        operation: String(claimed.length),
      });
    }

    let sent = 0;
    let cancelled = 0;
    let failed = 0;
    let recovery = 0;

    for (const notification of claimed) {
      const outcome = await processClaimedNotification(notification);
      if (outcome === "sent") {
        sent += 1;
      } else if (outcome === "cancelled") {
        cancelled += 1;
      } else if (outcome === "recovery") {
        recovery += 1;
      } else {
        failed += 1;
      }
    }

    return {
      processed: claimed.length,
      sent,
      cancelled,
      failed,
      recovery,
    };
  },
};
