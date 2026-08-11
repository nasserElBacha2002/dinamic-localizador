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
import {
  classifyTwilioOutboundError,
  isAmbiguousTwilioSendFailure,
} from "../utils/twilio-error-classifier";
import { twilioOutboundService } from "./twilio-outbound.service";

/**
 * At-least-once Twilio send is possible only via manual reconcile after
 * RECONCILIATION_REQUIRED — never an automatic second Twilio call for the same
 * notification after SEND_STARTED with an ambiguous or accepted attempt.
 */

const computeNextAttemptAt = (attemptCount: number, retryAfterMs?: number): Date => {
  if (retryAfterMs !== undefined && retryAfterMs > 0) {
    return new Date(Date.now() + retryAfterMs);
  }
  const baseMs = env.PAYROLL_RECEIPT_NOTIFICATION_RETRY_BASE_MS;
  const delayMs = baseMs * Math.pow(2, Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMs);
};

const isReceiptSendable = async (
  notification: PayrollReceiptNotification,
): Promise<
  | { ok: true; receipt: NonNullable<Awaited<ReturnType<typeof payrollReceiptRepository.findById>>>; employee: NonNullable<Awaited<ReturnType<typeof employeeRepository.findById>>> }
  | { ok: false; reason: "OBSOLETE" | "MODULE_DISABLED" | "EMPLOYEE_UNAVAILABLE" }
> => {
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
    return { ok: false, reason: "OBSOLETE" };
  }

  const moduleStates = await companyModuleService.getModuleStates(notification.companyId);
  if (moduleStates.get(COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS) !== true) {
    return { ok: false, reason: "MODULE_DISABLED" };
  }

  const employee = await employeeRepository.findById(
    notification.companyId,
    receipt.employeeId,
  );
  if (!employee || !employee.phoneNumber?.trim()) {
    return { ok: false, reason: "EMPLOYEE_UNAVAILABLE" };
  }

  return { ok: true, receipt, employee };
};

const cancelReasons: Record<
  "OBSOLETE" | "MODULE_DISABLED" | "EMPLOYEE_UNAVAILABLE",
  string
> = {
  OBSOLETE: "Receipt is no longer ASSOCIATED or missing storage",
  MODULE_DISABLED: "payroll_receipts module disabled",
  EMPLOYEE_UNAVAILABLE: "Employee missing or phone empty",
};

const processClaimedNotification = async (
  notification: PayrollReceiptNotification,
  workerId: string,
): Promise<"sent" | "cancelled" | "failed" | "recovery" | "reconciliation"> => {
  if (await payrollReceiptNotificationRepository.isCancelRequested(
    notification.companyId,
    notification.id,
  )) {
    await payrollReceiptNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CANCELLED",
      errorMessage: "Cancel requested before send",
    });
    payrollReceiptMetrics.notificationCancelled({ status: "CANCEL_REQUESTED" });
    return "cancelled";
  }

  const validation = await isReceiptSendable(notification);
  if (!validation.ok) {
    await payrollReceiptNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: validation.reason,
      errorMessage: cancelReasons[validation.reason],
    });
    payrollReceiptMetrics.notificationCancelled({ status: validation.reason });
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
    });
    payrollReceiptMetrics.notificationFailed({ errorCode: "CONFIG" });
    return "failed";
  }

  const attempt = await payrollReceiptNotificationRepository.beginSendAttempt({
    companyId: notification.companyId,
    notificationId: notification.id,
    leaseOwner: workerId,
    attemptNumber: notification.attemptCount,
  });

  if (!attempt) {
    if (
      await payrollReceiptNotificationRepository.isCancelRequested(
        notification.companyId,
        notification.id,
      )
    ) {
      await payrollReceiptNotificationRepository.markCancelled({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: "CANCELLED",
        errorMessage: "Cancel requested before Twilio send",
      });
      payrollReceiptMetrics.notificationCancelled({ status: "CANCEL_REQUESTED" });
      return "cancelled";
    }
    await payrollReceiptNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "BEGIN_SEND_CAS_FAILED",
      errorMessage: "Could not transition to SEND_STARTED",
      nextAttemptAt: null,
    });
    payrollReceiptMetrics.notificationFailed({ errorCode: "BEGIN_SEND_CAS_FAILED" });
    return "failed";
  }

  // Revalidate cancel + receipt immediately before Twilio (no automatic resend after this).
  if (
    await payrollReceiptNotificationRepository.isCancelRequested(
      notification.companyId,
      notification.id,
    )
  ) {
    await payrollReceiptNotificationRepository.markSendAttemptFailed({
      companyId: notification.companyId,
      attemptId: attempt.id,
      errorCode: "CANCELLED",
      errorMessage: "Cancel requested immediately before Twilio",
    });
    await payrollReceiptNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CANCELLED",
      errorMessage: "Cancel requested immediately before Twilio",
    });
    payrollReceiptMetrics.notificationCancelled({ status: "CANCEL_REQUESTED" });
    return "cancelled";
  }

  const revalidation = await isReceiptSendable(notification);
  if (!revalidation.ok) {
    await payrollReceiptNotificationRepository.markSendAttemptFailed({
      companyId: notification.companyId,
      attemptId: attempt.id,
      errorCode: revalidation.reason,
      errorMessage: cancelReasons[revalidation.reason],
    });
    await payrollReceiptNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: revalidation.reason,
      errorMessage: cancelReasons[revalidation.reason],
    });
    payrollReceiptMetrics.notificationCancelled({ status: revalidation.reason });
    return "cancelled";
  }

  const { receipt, employee } = revalidation;
  const contentVariables = buildPayrollReceiptAvailableTemplateVariables({
    year: receipt.year,
    month: receipt.month,
  });

  // PHASE A — provider send only. classifyTwilioOutboundError applies exclusively here.
  let messageSid: string;
  try {
    const result = await twilioOutboundService.sendWhatsAppTemplate({
      toPhoneNumber: employee.phoneNumber,
      contentSid,
      contentVariables,
    });
    messageSid = result.messageSid;
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
    const classification = classifyTwilioOutboundError(sendError);
    const maxAttempts =
      env.PAYROLL_RECEIPT_NOTIFICATION_MAX_ATTEMPTS ??
      PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS;

    if (isAmbiguousTwilioSendFailure(classification)) {
      await payrollReceiptNotificationRepository.markSendAttemptAmbiguous({
        companyId: notification.companyId,
        attemptId: attempt.id,
        errorCode: classification.normalizedCode,
        errorMessage,
      });
      await payrollReceiptNotificationRepository.markReconciliationRequired({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: classification.normalizedCode,
        errorMessage,
      });
      payrollReceiptMetrics.notificationFailed({ errorCode: "RECONCILIATION_REQUIRED" });
      return "reconciliation";
    }

    const exhausted = notification.attemptCount >= maxAttempts;
    const retryable = classification.retryable && !exhausted;

    await payrollReceiptNotificationRepository.markSendAttemptFailed({
      companyId: notification.companyId,
      attemptId: attempt.id,
      errorCode: classification.normalizedCode,
      errorMessage,
    });

    if (!retryable) {
      await payrollReceiptNotificationRepository.markFailed({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: exhausted ? "SEND_EXHAUSTED" : classification.normalizedCode,
        errorMessage,
        nextAttemptAt: null,
      });
      payrollReceiptMetrics.notificationFailed({
        errorCode: exhausted ? "SEND_EXHAUSTED" : "SEND_PERMANENT",
      });
      return "failed";
    }

    await payrollReceiptNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: classification.normalizedCode,
      errorMessage,
      nextAttemptAt: computeNextAttemptAt(
        notification.attemptCount,
        classification.retryAfterMs,
      ),
    });
    payrollReceiptMetrics.notificationRetried({ errorCode: classification.normalizedCode });
    return "failed";
  }

  // PHASE B — provider accepted. Never schedule another Twilio send for this notification.
  try {
    await whatsappMessageRepository.create({
      companyId: notification.companyId,
      messageSid,
      direction: "OUTBOUND",
      employeeId: employee.id,
      phoneFrom: env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+00000000000",
      phoneTo: employee.phoneNumber,
      messageType: "TEXT",
      body: `[TEMPLATE:PAYROLL_RECEIPT_AVAILABLE]`,
      latitude: null,
      longitude: null,
      status: "SEND_ACCEPTED",
      rawPayload: null,
      notificationId: notification.id,
    });
  } catch (obsError) {
    console.warn("[payroll-receipt-notification] outbound message persist failed (non-blocking)", {
      notificationId: notification.id,
      error: obsError instanceof Error ? obsError.message : String(obsError),
    });
  }

  try {
    await payrollReceiptNotificationRepository.markSendAttemptAccepted({
      companyId: notification.companyId,
      attemptId: attempt.id,
      providerMessageSid: messageSid,
    });
  } catch (attemptError) {
    const errorMessage =
      attemptError instanceof Error
        ? attemptError.message
        : "Unknown markSendAttemptAccepted error";
    try {
      await payrollReceiptNotificationRepository.markSentRecoveryRequired({
        companyId: notification.companyId,
        notificationId: notification.id,
        providerMessageSid: messageSid,
        errorMessage,
      });
    } catch {
      console.error("[payroll-receipt-notification] markSendAttemptAccepted recovery failed", {
        notificationId: notification.id,
        error: errorMessage,
      });
    }
    payrollReceiptMetrics.notificationFailed({ errorCode: "MARK_SEND_ATTEMPT_ACCEPTED_FAILED" });
    return "recovery";
  }

  try {
    await payrollReceiptNotificationRepository.markSendAccepted({
      companyId: notification.companyId,
      notificationId: notification.id,
      providerMessageSid: messageSid,
    });
    payrollReceiptMetrics.notificationSent({ status: "SEND_ACCEPTED" });
    return "sent";
  } catch (markError) {
    const errorMessage =
      markError instanceof Error ? markError.message : "Unknown markSendAccepted error";
    try {
      await payrollReceiptNotificationRepository.markSentRecoveryRequired({
        companyId: notification.companyId,
        notificationId: notification.id,
        providerMessageSid: messageSid,
        errorMessage,
      });
      payrollReceiptMetrics.notificationFailed({ errorCode: "MARK_SEND_ACCEPTED_FAILED" });
      return "recovery";
    } catch {
      console.error("[payroll-receipt-notification] markSendAccepted recovery failed", {
        notificationId: notification.id,
        error: errorMessage,
      });
      payrollReceiptMetrics.notificationFailed({ errorCode: "MARK_SENT_RECOVERY_FAILED" });
      return "recovery";
    }
  }
};

export const payrollReceiptNotificationService = {
  async processPendingBatch(limit = 5): Promise<{
    processed: number;
    sent: number;
    cancelled: number;
    failed: number;
    recovery: number;
    reconciliation: number;
  }> {
    const maxAttempts = env.PAYROLL_RECEIPT_NOTIFICATION_MAX_ATTEMPTS;
    await payrollReceiptNotificationRepository.reconcileTerminalStates();
    await payrollReceiptNotificationRepository.recoverExpiredLeases(50);

    const leaseSeconds = Math.max(
      30,
      Math.floor(env.PAYROLL_RECEIPT_NOTIFICATION_LEASE_MS / 1000),
    );
    const workerId = `payroll-receipt-notif-${process.pid}`;

    let sent = 0;
    let cancelled = 0;
    let failed = 0;
    let recovery = 0;
    let reconciliation = 0;
    let processed = 0;

    for (let i = 0; i < limit; i += 1) {
      const notification = await payrollReceiptNotificationRepository.claimNextOne(
        workerId,
        leaseSeconds,
        maxAttempts,
      );
      if (!notification) {
        break;
      }

      payrollReceiptMetrics.notificationClaimed({
        status: "PROCESSING",
        operation: "1",
      });

      processed += 1;
      const outcome = await processClaimedNotification(notification, workerId);
      if (outcome === "sent") {
        sent += 1;
      } else if (outcome === "cancelled") {
        cancelled += 1;
      } else if (outcome === "recovery") {
        recovery += 1;
      } else if (outcome === "reconciliation") {
        reconciliation += 1;
      } else {
        failed += 1;
      }
    }

    return {
      processed,
      sent,
      cancelled,
      failed,
      recovery,
      reconciliation,
    };
  },
};
