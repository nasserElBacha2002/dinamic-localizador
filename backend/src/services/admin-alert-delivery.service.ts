import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import {
  ADMIN_ALERT_CATEGORY_PREFERENCE_COLUMN,
  ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS,
  DYNAMIC_ADMIN_ATTENDANCE_ALERT_TYPES,
  type DynamicAdminAttendanceAlertType,
} from "../constants/admin-alert";
import { adminAlertNotificationRepository } from "../repositories/admin-alert-notification.repository";
import { adminDynamicAttendanceAlertRepository } from "../repositories/admin-dynamic-attendance-alert.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { AdminAlertNotification } from "../types/admin-alert";
import { resolveAdminAlertContentSid } from "../utils/admin-alert/content-sid";
import {
  isDueWithinMaxLateness,
  minutesBetween,
} from "../utils/admin-alert/dynamic-attendance-due-at";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import {
  classifyTwilioOutboundError,
  isAmbiguousTwilioSendFailure,
} from "../utils/twilio-error-classifier";
import { twilioOutboundService } from "./twilio-outbound.service";

const isDynamicAttendanceAlertType = (
  alertType: string,
): alertType is DynamicAdminAttendanceAlertType =>
  (DYNAMIC_ADMIN_ATTENDANCE_ALERT_TYPES as readonly string[]).includes(alertType);

const resolveDynamicTypeEnabled = (
  alertType: DynamicAdminAttendanceAlertType,
  settings: {
    adminAttendanceConfirmationMissingEnabled: boolean;
    adminMissingCheckinEnabled: boolean;
    adminMissingCheckoutEnabled: boolean;
  },
): boolean => {
  switch (alertType) {
    case "ATTENDANCE_CONFIRMATION_MISSING":
      return settings.adminAttendanceConfirmationMissingEnabled;
    case "MISSING_CHECKIN_AFTER_START":
      return settings.adminMissingCheckinEnabled;
    case "MISSING_CHECKOUT_AFTER_END":
      return settings.adminMissingCheckoutEnabled;
    default:
      return false;
  }
};

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
  now: Date = new Date(),
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

  const categoryPreferenceKey =
    ADMIN_ALERT_CATEGORY_PREFERENCE_COLUMN[notification.templateCategory];
  if (!recipient[categoryPreferenceKey]) {
    await adminAlertNotificationRepository.markSkipped({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CATEGORY_DISABLED",
      errorMessage: `Recipient disabled ${notification.templateCategory} alerts before send`,
    });
    logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
      companyId: notification.companyId,
      recipientId: notification.recipientId,
      alertType: notification.alertType,
      outboxId: notification.id,
      reason: "CATEGORY_DISABLED",
    });
    return "skipped";
  }

  if (isDynamicAttendanceAlertType(notification.alertType)) {
    const evaluatedAt = now;
    const settings = await companySettingsRepository.findByCompanyId(notification.companyId);
    if (!settings?.adminAlertsEnabled) {
      await adminAlertNotificationRepository.markTerminalSkip({
        companyId: notification.companyId,
        notificationId: notification.id,
        status: "SKIPPED_DISABLED",
        errorCode: "ADMIN_ALERTS_DISABLED",
        errorMessage: "Company admin alerts disabled before send",
        evaluatedAt,
      });
      logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
        companyId: notification.companyId,
        alertType: notification.alertType,
        outboxId: notification.id,
        reason: "SKIPPED_DISABLED",
      });
      return "skipped";
    }
    if (!resolveDynamicTypeEnabled(notification.alertType, settings)) {
      await adminAlertNotificationRepository.markTerminalSkip({
        companyId: notification.companyId,
        notificationId: notification.id,
        status: "SKIPPED_DISABLED",
        errorCode: "DYNAMIC_TYPE_DISABLED",
        errorMessage: `Dynamic alert type ${notification.alertType} disabled before send`,
        evaluatedAt,
      });
      logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
        companyId: notification.companyId,
        alertType: notification.alertType,
        outboxId: notification.id,
        reason: "SKIPPED_DISABLED",
      });
      return "skipped";
    }

    const dueAt = notification.dueAt
      ? new Date(notification.dueAt)
      : notification.occurredAt
        ? new Date(notification.occurredAt)
        : null;
    const watermark = settings.adminAlertsEnabledAt
      ? new Date(settings.adminAlertsEnabledAt)
      : null;
    if (
      !dueAt ||
      Number.isNaN(dueAt.getTime()) ||
      !isDueWithinMaxLateness(
        dueAt,
        evaluatedAt,
        settings.adminAlertMaxLatenessMinutes,
        watermark,
      )
    ) {
      const latenessMinutes = dueAt ? minutesBetween(dueAt, evaluatedAt) : null;
      await adminAlertNotificationRepository.markTerminalSkip({
        companyId: notification.companyId,
        notificationId: notification.id,
        status: "EXPIRED",
        errorCode: "SKIPPED_TOO_LATE",
        errorMessage: "Dynamic alert exceeded adminAlertMaxLatenessMinutes before send",
        latenessMinutes,
        evaluatedAt,
      });
      logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
        companyId: notification.companyId,
        alertType: notification.alertType,
        outboxId: notification.id,
        operationId: notification.operationId,
        employeeId: notification.employeeId,
        reason: "EXPIRED",
      });
      return "skipped";
    }

    const gate = await adminDynamicAttendanceAlertRepository.getDynamicAlertSendGate(
      notification.companyId,
      notification.alertType,
      {
        operationId: notification.operationId,
        employeeId: notification.employeeId,
        assignmentId: notification.assignmentId,
        employeeWorkdayId: notification.employeeWorkdayId,
        deduplicationKey: notification.deduplicationKey,
      },
    );
    if (gate !== "ELIGIBLE") {
      await adminAlertNotificationRepository.markSkipped({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: gate,
        errorMessage: `Dynamic attendance alert resolved before send (${gate})`,
      });
      logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
        companyId: notification.companyId,
        recipientId: notification.recipientId,
        alertType: notification.alertType,
        outboxId: notification.id,
        operationId: notification.operationId,
        employeeId: notification.employeeId,
        reason: gate,
      });
      return "skipped";
    }
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
      costContext: {
        companyId: notification.companyId,
        messageKind: "TEMPLATE",
        flowLabel: "ADMIN_ALERT",
        templateName: notification.alertType,
      },
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
      absenceRequestId: notification.absenceRequestId,
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
  async processPendingBatch(
    batchSize = env.ADMIN_ALERT_DELIVERY_BATCH_SIZE,
    options?: { now?: Date },
  ): Promise<{
    processed: number;
    sent: number;
    skipped: number;
    failed: number;
    recovery: number;
    reconciliation: number;
    pendingCount: number;
    dynamicPendingCount: number;
    oldestPendingAgeMinutes: number | null;
  }> {
    await adminAlertNotificationRepository.recoverExpiredLeases(batchSize);
    const queueStats = await adminAlertNotificationRepository.getDeliveryQueueStats();
    const workerId = randomUUID();
    const leaseSeconds = Math.ceil(env.ADMIN_ALERT_LEASE_MS / 1000);
    const claimed = await adminAlertNotificationRepository.claimNextBatch(
      workerId,
      batchSize,
      leaseSeconds,
      env.ADMIN_ALERT_MAX_ATTEMPTS,
    );
    const now = options?.now ?? new Date();

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let recovery = 0;
    let reconciliation = 0;

    for (const notification of claimed) {
      const outcome = await processClaimedNotification(notification, workerId, now);
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
      pendingCount: queueStats.pendingCount,
      dynamicPendingCount: queueStats.dynamicPendingCount,
      oldestPendingAgeMinutes: queueStats.oldestPendingAgeMinutes,
    };
  },
};
