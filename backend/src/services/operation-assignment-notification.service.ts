import { env } from "../config/env";
import { OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS } from "../constants/operation-assignment-notification";
import { employeeRepository } from "../repositories/employee.repository";
import { operationAssignmentNotificationRepository } from "../repositories/operation-assignment-notification.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { serviceRepository } from "../repositories/service.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { OperationAssignmentNotification } from "../types/operation-assignment-notification";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { isAssignmentActiveOnWorkDate } from "../utils/assignment-period";
import { buildOperationAssignmentAssignedTemplateVariables } from "../utils/operation-assignment-notification/assigned-template-variables";
import { operationAssignmentNotificationMetrics } from "../utils/operation-assignment-notification/metrics";
import {
  classifyTwilioOutboundError,
  isAmbiguousTwilioSendFailure,
} from "../utils/twilio-error-classifier";
import { twilioOutboundService } from "./twilio-outbound.service";
import { logWhatsAppNotificationSent } from "../utils/whatsapp-notification-observability";

/**
 * At-least-once Twilio send is possible only via manual reconcile after
 * RECONCILIATION_REQUIRED / SENT_RECOVERY_REQUIRED — never an automatic second
 * Twilio call after the provider returned a MessageSid or an ambiguous outcome.
 */

const computeNextAttemptAt = (attemptCount: number, retryAfterMs?: number): Date => {
  if (retryAfterMs !== undefined && retryAfterMs > 0) {
    return new Date(Date.now() + retryAfterMs);
  }
  const baseMs = env.OPERATION_ASSIGNMENT_NOTIFICATION_RETRY_BASE_MS;
  const delayMs = baseMs * Math.pow(2, Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMs);
};

const employeeFirstName = (fullName: string): string => {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.split(/\s+/)[0] ?? trimmed;
};

type CancelReason =
  | "OBSOLETE"
  | "ASSIGNMENT_OUT_OF_RANGE"
  | "MISSING_PHONE"
  | "EMPLOYEE_UNAVAILABLE";

const cancelReasons: Record<CancelReason, string> = {
  OBSOLETE: "Assignment or ONE_TIME operation no longer valid for notification",
  ASSIGNMENT_OUT_OF_RANGE: "Assignment validFrom/validUntil does not cover operation work date",
  MISSING_PHONE: "Employee phone empty",
  EMPLOYEE_UNAVAILABLE: "Employee missing or inactive",
};

const isAssignmentSendable = async (
  notification: OperationAssignmentNotification,
): Promise<
  | {
      ok: true;
      employee: NonNullable<Awaited<ReturnType<typeof employeeRepository.findById>>>;
      service: NonNullable<Awaited<ReturnType<typeof serviceRepository.findById>>>;
      scheduledStart: string;
    }
  | { ok: false; reason: CancelReason }
> => {
  const assignment = await operationEmployeeRepository.findById(
    notification.companyId,
    notification.operationAssignmentId,
  );
  if (!assignment || assignment.cancelledAt) {
    return { ok: false, reason: "OBSOLETE" };
  }

  const operation = await operationRepository.findById(
    notification.companyId,
    notification.operationId,
  );
  if (
    !operation ||
    operation.operationKind !== "ONE_TIME" ||
    operation.status === "CANCELLED" ||
    !operation.scheduledStart
  ) {
    return { ok: false, reason: "OBSOLETE" };
  }

  const workDate = getDateIsoInTimezone(
    new Date(operation.scheduledStart),
    env.BOT_OPERATION_TIMEZONE,
  );
  if (
    !isAssignmentActiveOnWorkDate({
      validFrom: assignment.validFrom,
      validUntil: assignment.validUntil,
      workDate,
      cancelledAt: assignment.cancelledAt,
    })
  ) {
    return { ok: false, reason: "ASSIGNMENT_OUT_OF_RANGE" };
  }

  const employee = await employeeRepository.findById(
    notification.companyId,
    notification.employeeId,
  );
  if (!employee || !employee.active) {
    return { ok: false, reason: "EMPLOYEE_UNAVAILABLE" };
  }
  if (!employee.phoneNumber?.trim()) {
    return { ok: false, reason: "MISSING_PHONE" };
  }

  const service = await serviceRepository.findById(
    notification.companyId,
    operation.serviceId,
  );
  if (!service) {
    return { ok: false, reason: "OBSOLETE" };
  }

  return {
    ok: true,
    employee,
    service,
    scheduledStart: operation.scheduledStart,
  };
};

const persistProviderAccepted = async (input: {
  notification: OperationAssignmentNotification;
  attemptId: string;
  messageSid: string;
  employeeId: string;
  employeePhone: string;
}): Promise<"sent" | "recovery"> => {
  const { notification, attemptId, messageSid, employeeId, employeePhone } = input;

  try {
    await whatsappMessageRepository.create({
      companyId: notification.companyId,
      messageSid,
      direction: "OUTBOUND",
      employeeId,
      phoneFrom: env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+00000000000",
      phoneTo: employeePhone,
      messageType: "TEXT",
      body: `[TEMPLATE:EVENTUAL_OPERATION_ASSIGNED]`,
      latitude: null,
      longitude: null,
      status: "SEND_ACCEPTED",
      rawPayload: null,
      notificationId: notification.id,
    });
  } catch (obsError) {
    // Observability gap is non-blocking: outbox keeps provider_message_sid for callbacks.
    console.warn(
      "[operation-assignment-notification] outbound message persist failed (non-blocking)",
      {
        notificationId: notification.id,
        error: obsError instanceof Error ? obsError.message : String(obsError),
      },
    );
  }

  try {
    await operationAssignmentNotificationRepository.markSendAttemptAccepted({
      companyId: notification.companyId,
      attemptId,
      providerMessageSid: messageSid,
    });
  } catch (attemptError) {
    const errorMessage =
      attemptError instanceof Error
        ? attemptError.message
        : "Unknown markSendAttemptAccepted error";
    try {
      await operationAssignmentNotificationRepository.markSentRecoveryRequired({
        companyId: notification.companyId,
        notificationId: notification.id,
        providerMessageSid: messageSid,
        errorMessage,
      });
    } catch {
      console.error(
        "[operation-assignment-notification] markSendAttemptAccepted recovery failed",
        { notificationId: notification.id, error: errorMessage },
      );
    }
    operationAssignmentNotificationMetrics.notificationFailed({
      errorCode: "MARK_SEND_ATTEMPT_ACCEPTED_FAILED",
    });
    return "recovery";
  }

  try {
    await operationAssignmentNotificationRepository.markSendAccepted({
      companyId: notification.companyId,
      notificationId: notification.id,
      providerMessageSid: messageSid,
    });
    operationAssignmentNotificationMetrics.notificationSent({ status: "SEND_ACCEPTED" });
    return "sent";
  } catch (markError) {
    const errorMessage =
      markError instanceof Error ? markError.message : "Unknown markSendAccepted error";
    try {
      await operationAssignmentNotificationRepository.markSentRecoveryRequired({
        companyId: notification.companyId,
        notificationId: notification.id,
        providerMessageSid: messageSid,
        errorMessage,
      });
      operationAssignmentNotificationMetrics.notificationFailed({
        errorCode: "MARK_SEND_ACCEPTED_FAILED",
      });
      return "recovery";
    } catch {
      console.error("[operation-assignment-notification] markSendAccepted recovery failed", {
        notificationId: notification.id,
        error: errorMessage,
      });
      operationAssignmentNotificationMetrics.notificationFailed({
        errorCode: "MARK_SENT_RECOVERY_FAILED",
      });
      return "recovery";
    }
  }
};

const processClaimedNotification = async (
  notification: OperationAssignmentNotification,
  workerId: string,
): Promise<"sent" | "cancelled" | "failed" | "recovery" | "reconciliation"> => {
  if (
    await operationAssignmentNotificationRepository.isCancelRequested(
      notification.companyId,
      notification.id,
    )
  ) {
    await operationAssignmentNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CANCELLED",
      errorMessage: "Cancel requested before send",
    });
    operationAssignmentNotificationMetrics.notificationCancelled({ status: "CANCEL_REQUESTED" });
    return "cancelled";
  }

  const validation = await isAssignmentSendable(notification);
  if (!validation.ok) {
    await operationAssignmentNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: validation.reason,
      errorMessage: cancelReasons[validation.reason],
    });
    operationAssignmentNotificationMetrics.notificationCancelled({ status: validation.reason });
    return "cancelled";
  }

  const contentSid = env.TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID?.trim();
  if (!contentSid) {
    await operationAssignmentNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CONFIG",
      errorMessage: "TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID is not configured",
      nextAttemptAt: null,
    });
    operationAssignmentNotificationMetrics.notificationFailed({ errorCode: "CONFIG" });
    return "failed";
  }

  const attempt = await operationAssignmentNotificationRepository.beginSendAttempt({
    companyId: notification.companyId,
    notificationId: notification.id,
    leaseOwner: workerId,
    attemptNumber: notification.attemptCount,
  });

  if (!attempt) {
    if (
      await operationAssignmentNotificationRepository.isCancelRequested(
        notification.companyId,
        notification.id,
      )
    ) {
      await operationAssignmentNotificationRepository.markCancelled({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: "CANCELLED",
        errorMessage: "Cancel requested before Twilio send",
      });
      operationAssignmentNotificationMetrics.notificationCancelled({ status: "CANCEL_REQUESTED" });
      return "cancelled";
    }
    await operationAssignmentNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "BEGIN_SEND_CAS_FAILED",
      errorMessage: "Could not transition to SEND_STARTED",
      nextAttemptAt: null,
    });
    operationAssignmentNotificationMetrics.notificationFailed({
      errorCode: "BEGIN_SEND_CAS_FAILED",
    });
    return "failed";
  }

  if (
    await operationAssignmentNotificationRepository.isCancelRequested(
      notification.companyId,
      notification.id,
    )
  ) {
    await operationAssignmentNotificationRepository.markSendAttemptFailed({
      companyId: notification.companyId,
      attemptId: attempt.id,
      errorCode: "CANCELLED",
      errorMessage: "Cancel requested immediately before Twilio",
    });
    await operationAssignmentNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: "CANCELLED",
      errorMessage: "Cancel requested immediately before Twilio",
    });
    operationAssignmentNotificationMetrics.notificationCancelled({ status: "CANCEL_REQUESTED" });
    return "cancelled";
  }

  const revalidation = await isAssignmentSendable(notification);
  if (!revalidation.ok) {
    await operationAssignmentNotificationRepository.markSendAttemptFailed({
      companyId: notification.companyId,
      attemptId: attempt.id,
      errorCode: revalidation.reason,
      errorMessage: cancelReasons[revalidation.reason],
    });
    await operationAssignmentNotificationRepository.markCancelled({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: revalidation.reason,
      errorMessage: cancelReasons[revalidation.reason],
    });
    operationAssignmentNotificationMetrics.notificationCancelled({ status: revalidation.reason });
    return "cancelled";
  }

  const { employee, service, scheduledStart } = revalidation;
  const contentVariables = buildOperationAssignmentAssignedTemplateVariables({
    employeeFirstName: employeeFirstName(employee.name),
    serviceName: service.name,
    serviceAddress: service.address,
    serviceLocality: service.locality,
    scheduledStart,
    timeZone: env.BOT_OPERATION_TIMEZONE,
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
    logWhatsAppNotificationSent({
      event: "WHATSAPP_NOTIFICATION_SENT",
      producer: "ASSIGNMENT_NOTIFICATION_WORKER",
      companyId: notification.companyId,
      employeeId: employee.id,
      operationId: notification.operationId,
      operationAssignmentId: notification.operationAssignmentId,
      notificationType: notification.notificationType,
      templateSid: contentSid,
      templateVariables: contentVariables,
      notificationId: notification.id,
      attempt: notification.attemptCount,
      providerMessageSid: messageSid,
      sentAt: new Date().toISOString(),
    });
  } catch (sendError) {
    const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
    const classification = classifyTwilioOutboundError(sendError);
    const maxAttempts =
      env.OPERATION_ASSIGNMENT_NOTIFICATION_MAX_ATTEMPTS ??
      OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS;

    logWhatsAppNotificationSent({
      event: "WHATSAPP_NOTIFICATION_FAILED",
      producer: "ASSIGNMENT_NOTIFICATION_WORKER",
      companyId: notification.companyId,
      employeeId: employee.id,
      operationId: notification.operationId,
      operationAssignmentId: notification.operationAssignmentId,
      notificationType: notification.notificationType,
      templateSid: contentSid,
      templateVariables: contentVariables,
      notificationId: notification.id,
      attempt: notification.attemptCount,
      errorCode: classification.normalizedCode,
      errorMessage,
    });

    if (isAmbiguousTwilioSendFailure(classification)) {
      await operationAssignmentNotificationRepository.markSendAttemptAmbiguous({
        companyId: notification.companyId,
        attemptId: attempt.id,
        errorCode: classification.normalizedCode,
        errorMessage,
      });
      await operationAssignmentNotificationRepository.markReconciliationRequired({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: classification.normalizedCode,
        errorMessage,
      });
      operationAssignmentNotificationMetrics.notificationFailed({
        errorCode: "RECONCILIATION_REQUIRED",
      });
      return "reconciliation";
    }

    const exhausted = notification.attemptCount >= maxAttempts;
    const retryable = classification.retryable && !exhausted;

    await operationAssignmentNotificationRepository.markSendAttemptFailed({
      companyId: notification.companyId,
      attemptId: attempt.id,
      errorCode: classification.normalizedCode,
      errorMessage,
    });

    if (!retryable) {
      await operationAssignmentNotificationRepository.markFailed({
        companyId: notification.companyId,
        notificationId: notification.id,
        errorCode: exhausted ? "SEND_EXHAUSTED" : classification.normalizedCode,
        errorMessage,
        nextAttemptAt: null,
      });
      operationAssignmentNotificationMetrics.notificationFailed({
        errorCode: exhausted ? "SEND_EXHAUSTED" : "SEND_PERMANENT",
      });
      return "failed";
    }

    await operationAssignmentNotificationRepository.markFailed({
      companyId: notification.companyId,
      notificationId: notification.id,
      errorCode: classification.normalizedCode,
      errorMessage,
      nextAttemptAt: computeNextAttemptAt(
        notification.attemptCount,
        classification.retryAfterMs,
      ),
    });
    operationAssignmentNotificationMetrics.notificationRetried({
      errorCode: classification.normalizedCode,
    });
    return "failed";
  }

  // PHASE B — provider accepted. Never schedule another Twilio send for this notification.
  return persistProviderAccepted({
    notification,
    attemptId: attempt.id,
    messageSid,
    employeeId: employee.id,
    employeePhone: employee.phoneNumber,
  });
};

export const operationAssignmentNotificationService = {
  async processPendingBatch(limit = 5): Promise<{
    processed: number;
    sent: number;
    cancelled: number;
    failed: number;
    recovery: number;
    reconciliation: number;
  }> {
    const maxAttempts = env.OPERATION_ASSIGNMENT_NOTIFICATION_MAX_ATTEMPTS;
    await operationAssignmentNotificationRepository.reconcileTerminalStates();
    await operationAssignmentNotificationRepository.recoverExpiredLeases(50);

    const leaseSeconds = Math.max(
      30,
      Math.floor(env.OPERATION_ASSIGNMENT_NOTIFICATION_LEASE_MS / 1000),
    );
    const workerId = `operation-assignment-notif-${process.pid}`;

    let sent = 0;
    let cancelled = 0;
    let failed = 0;
    let recovery = 0;
    let reconciliation = 0;
    let processed = 0;

    for (let i = 0; i < limit; i += 1) {
      const notification = await operationAssignmentNotificationRepository.claimNextOne(
        workerId,
        leaseSeconds,
        maxAttempts,
      );
      if (!notification) {
        break;
      }

      operationAssignmentNotificationMetrics.notificationClaimed({
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
