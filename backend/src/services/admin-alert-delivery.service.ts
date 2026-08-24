import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS } from "../constants/admin-alert";
import { adminAlertNotificationRepository } from "../repositories/admin-alert-notification.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { AdminAlertNotification } from "../types/admin-alert";
import { resolveAdminAlertContentSid } from "../utils/admin-alert/content-sid";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import {
  classifyTwilioOutboundError,
  isAmbiguousTwilioSendFailure,
} from "../utils/twilio-error-classifier";
import { twilioOutboundService } from "./twilio-outbound.service";

const computeNextAttemptAt = (attemptCount: number, retryAfterMs?: number): Date => {
  if (retryAfterMs !== undefined && retryAfterMs > 0) {
    return new Date(Date.now() + retryAfterMs);
  }
  const baseMs = env.ADMIN_ALERT_RETRY_BASE_MS;
  const delayMs = baseMs * Math.pow(2, Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMs);
};

const persistProviderAccepted = async (input: {
  notification: AdminAlertNotification;
  attemptId: string;
  messageSid: string;
}): Promise<"sent" | "recovery"> => {
  const { notification, attemptId, messageSid } = input;

  try {
    await whatsappMessageRepository.create({
      companyId: notification.companyId,
      messageSid,
      direction: "OUTBOUND",
      employeeId: notification.employeeId,
      phoneFrom: env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+00000000000",
      phoneTo: notification.recipientPhone,
      messageType: "TEXT",
      body: `[TEMPLATE:ADMIN_ALERT:${notification.alertType}]`,
      latitude: null,
      longitude: null,
      status: "SEND_ACCEPTED",
      rawPayload: null,
      notificationId: notification.id,
    });
  } catch (obsError) {
    console.warn("[admin-alert-delivery] outbound message persist failed (non-blocking)", {
      notificationId: notification.id,
      error: obsError instanceof Error ? obsError.message : String(obsError),
    });
  }

  try {
    await adminAlertNotificationRepository.markSendAttemptAccepted({
      companyId: notification.companyId,
      attemptId,
      providerMessageSid: messageSid,
    });
  } catch (attemptError) {
    const errorMessage =
      attemptError instanceof Error ? attemptError.message : "Unknown markSendAttemptAccepted error";
    await adminAlertNotificationRepository.markSentRecoveryRequired({
      companyId: notification.companyId,
      notificationId: notification.id,
      providerMessageSid: messageSid,
      errorMessage,
    });
    return "recovery";
  }

  try {
    await adminAlertNotificationRepository.markSendAccepted({
      companyId: notification.companyId,
      notificationId: notification.id,
      providerMessageSid: messageSid,
    });
    return "sent";
  } catch (markError) {
    const errorMessage =
      markError instanceof Error ? markError.message : "Unknown markSendAccepted error";
    await adminAlertNotificationRepository.markSentRecoveryRequired({
      companyId: notification.companyId,
      notificationId: notification.id,
      providerMessageSid: messageSid,
      errorMessage,
    });
    return "recovery";
  }
};

const processClaimedNotification = async (
  notification: AdminAlertNotification,
  workerId: string,
): Promise<"sent" | "skipped" | "failed" | "recovery" | "reconciliation"> => {
  const recipient = await companyAlertRecipientRepository.findById(
    notification.companyId,
    notification.recipientId,
  );
  if (!recipient || !recipient.isEnabled) {
    await adminAlertNotificationRepository.markSkipped({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "RECIPIENT_DISABLED",
      errorMessage: "Recipient disabled or removed before send",
    });
    logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
      companyId: notification.companyId,
      recipientId: notification.recipientId,
      alertType: notification.alertType,
      outboxId: notification.id,
      reason: "RECIPIENT_DISABLED",
    });
    return "skipped";
  }

  const contentSid = resolveAdminAlertContentSid(notification.templateCategory);
  if (!contentSid) {
    await adminAlertNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CONFIG",
      errorMessage: "Admin alert Content SID is not configured",
      nextAttemptAt: null,
    });
    logAdminAlertEvent("ADMIN_ALERT_FAILED", {
      companyId: notification.companyId,
      outboxId: notification.id,
      alertType: notification.alertType,
      reason: "MISSING_CONTENT_SID",
    });
    return "failed";
  }

  const attempt = await adminAlertNotificationRepository.beginSendAttempt({
    companyId: notification.companyId,
    notificationId: notification.id,
    leaseOwner: workerId,
    attemptNumber: notification.attemptCount,
  });

  if (!attempt) {
    await adminAlertNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "BEGIN_SEND_CAS_FAILED",
      errorMessage: "Could not transition to SEND_STARTED",
      nextAttemptAt: null,
    });
    return "failed";
  }

  let contentVariables: Record<string, string>;
  try {
    contentVariables = JSON.parse(notification.contentVariablesJson) as Record<string, string>;
  } catch {
    await adminAlertNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "INVALID_TEMPLATE_VARS",
      errorMessage: "Stored content_variables_json is invalid",
      nextAttemptAt: null,
    });
    return "failed";
  }

  let messageSid: string;
  try {
    const result = await twilioOutboundService.sendWhatsAppTemplate({
      toPhoneNumber: notification.recipientPhone,
      contentSid,
      contentVariables,
    });
    messageSid = result.messageSid;
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
    const classification = classifyTwilioOutboundError(sendError);
    const maxAttempts = env.ADMIN_ALERT_MAX_ATTEMPTS ?? ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS;

    if (isAmbiguousTwilioSendFailure(classification)) {
      await adminAlertNotificationRepository.markSendAttemptAmbiguous({
        companyId: notification.companyId,
        attemptId: attempt.id,
        errorCode: classification.normalizedCode,
        errorMessage,
      });
      await adminAlertNotificationRepository.markReconciliationRequired({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: classification.normalizedCode,
        errorMessage,
      });
      logAdminAlertEvent("ADMIN_ALERT_FAILED", {
        companyId: notification.companyId,
        outboxId: notification.id,
        alertType: notification.alertType,
        reason: "RECONCILIATION_REQUIRED",
      });
      return "reconciliation";
    }

    const exhausted = notification.attemptCount >= maxAttempts;
    const retryable = classification.retryable && !exhausted;

    await adminAlertNotificationRepository.markSendAttemptFailed({
      companyId: notification.companyId,
      attemptId: attempt.id,
      errorCode: classification.normalizedCode,
      errorMessage,
    });

    if (!retryable) {
      await adminAlertNotificationRepository.markFailed({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: exhausted ? "SEND_EXHAUSTED" : classification.normalizedCode,
        errorMessage,
        nextAttemptAt: null,
      });
      logAdminAlertEvent("ADMIN_ALERT_FAILED", {
        companyId: notification.companyId,
        outboxId: notification.id,
        alertType: notification.alertType,
        reason: exhausted ? "SEND_EXHAUSTED" : "SEND_PERMANENT",
      });
      return "failed";
    }

    const nextAttemptAt = computeNextAttemptAt(
      notification.attemptCount,
      classification.retryAfterMs,
    );
    await adminAlertNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: classification.normalizedCode,
      errorMessage,
      nextAttemptAt,
    });
    logAdminAlertEvent("ADMIN_ALERT_RETRY", {
      companyId: notification.companyId,
      outboxId: notification.id,
      alertType: notification.alertType,
      reason: classification.normalizedCode,
    });
    return "failed";
  }

  const outcome = await persistProviderAccepted({
    notification,
    attemptId: attempt.id,
    messageSid,
  });

  if (outcome === "sent") {
    logAdminAlertEvent("ADMIN_ALERT_SENT", {
      companyId: notification.companyId,
      recipientId: notification.recipientId,
      alertType: notification.alertType,
      outboxId: notification.id,
      operationId: notification.operationId,
      employeeId: notification.employeeId,
      providerMessageSid: messageSid,
    });
    return "sent";
  }

  logAdminAlertEvent("ADMIN_ALERT_FAILED", {
    companyId: notification.companyId,
    outboxId: notification.id,
    alertType: notification.alertType,
    providerMessageSid: messageSid,
    reason: "SENT_RECOVERY_REQUIRED",
  });
  return "recovery";
};

export const adminAlertDeliveryService = {
  async processPendingBatch(batchSize = 8): Promise<{
    processed: number;
    sent: number;
    skipped: number;
    failed: number;
    recovery: number;
    reconciliation: number;
  }> {
    await adminAlertNotificationRepository.recoverExpiredLeases(batchSize);
    const workerId = randomUUID();
    const leaseSeconds = Math.ceil(env.ADMIN_ALERT_LEASE_MS / 1000);
    const claimed = await adminAlertNotificationRepository.claimNextBatch(
      workerId,
      batchSize,
      leaseSeconds,
      env.ADMIN_ALERT_MAX_ATTEMPTS,
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let recovery = 0;
    let reconciliation = 0;

    for (const notification of claimed) {
      const outcome = await processClaimedNotification(notification, workerId);
      switch (outcome) {
        case "sent":
          sent += 1;
          break;
        case "skipped":
          skipped += 1;
          break;
        case "recovery":
          recovery += 1;
          break;
        case "reconciliation":
          reconciliation += 1;
          break;
        default:
          failed += 1;
      }
    }

    return {
      processed: claimed.length,
      sent,
      skipped,
      failed,
      recovery,
      reconciliation,
    };
  },
};
