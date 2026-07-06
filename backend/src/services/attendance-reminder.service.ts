import { env } from "../config/env";
import type { AttendanceNotificationType } from "../constants/attendance-notification";
import {
  NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_REMINDER,
  NO_LONGER_ELIGIBLE_FOR_NO_CHECKIN_AT_START,
  SENT_CONTEXT_FAILED_ERROR,
  SENT_PERSISTENCE_UNKNOWN_ERROR,
} from "../constants/attendance-notification";
import { AppError } from "../errors/app-error";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import { companyRepository } from "../repositories/company.repository";
import type { AttendanceReminderCandidate } from "../types/attendance-notification";
import { buildAttendanceReminderTemplateVariables } from "../utils/attendance-reminder-template";
import { buildOperationStartDueWindow, buildReminderDueWindow } from "../utils/reminder-time-window";
import { botSessionService } from "./bot-session.service";
import { twilioOutboundService } from "./twilio-outbound.service";
import type { BotSession } from "../types/twilio.types";

export type ReminderSendOutcome =
  | "sent"
  | "failed"
  | "skipped"
  | "sent_context_failed"
  | "sent_persistence_unknown";

export interface AttendanceReminderRunSummary {
  referenceAt: string;
  arrivalCandidates: number;
  exitCandidates: number;
  noCheckInCandidates: number;
  confirmationCandidates: number;
  arrivalSent: number;
  exitSent: number;
  noCheckInSent: number;
  confirmationSent: number;
  arrivalFailed: number;
  exitFailed: number;
  noCheckInFailed: number;
  confirmationFailed: number;
  arrivalSkipped: number;
  exitSkipped: number;
  noCheckInSkipped: number;
  confirmationSkipped: number;
}

const emptySummary = (referenceAt: Date): AttendanceReminderRunSummary => ({
  referenceAt: referenceAt.toISOString(),
  arrivalCandidates: 0,
  exitCandidates: 0,
  noCheckInCandidates: 0,
  confirmationCandidates: 0,
  arrivalSent: 0,
  exitSent: 0,
  noCheckInSent: 0,
  confirmationSent: 0,
  arrivalFailed: 0,
  exitFailed: 0,
  noCheckInFailed: 0,
  confirmationFailed: 0,
  arrivalSkipped: 0,
  exitSkipped: 0,
  noCheckInSkipped: 0,
  confirmationSkipped: 0,
});

const contentSidForType = (notificationType: AttendanceNotificationType): string | null => {
  if (notificationType === "ARRIVAL_REMINDER_15_MIN") {
    if (!env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID) {
      throw new Error("TWILIO_ARRIVAL_REMINDER_CONTENT_SID_NOT_CONFIGURED");
    }

    return env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID;
  }

  if (notificationType === "EXIT_REMINDER_15_MIN") {
    if (!env.TWILIO_EXIT_REMINDER_CONTENT_SID) {
      throw new Error("TWILIO_EXIT_REMINDER_CONTENT_SID_NOT_CONFIGURED");
    }

    return env.TWILIO_EXIT_REMINDER_CONTENT_SID;
  }

  if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER") {
    return env.TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID ?? null;
  }

  return env.TWILIO_TEMPLATE_NO_CHECKIN_SID ?? null;
};

const hasValidWhatsAppPhone = (phoneNumber: string | null | undefined): boolean =>
  Boolean(phoneNumber && phoneNumber.trim().length > 0);

const buildTemplateVariables = (
  candidate: AttendanceReminderCandidate,
  notificationType: AttendanceNotificationType,
): Record<string, string> =>
  buildAttendanceReminderTemplateVariables(
    candidate,
    notificationType,
    candidate.operationTimezone ?? env.BOT_OPERATION_TIMEZONE,
  );

const sendReminderForCandidate = async (
  companyId: string,
  candidate: AttendanceReminderCandidate,
  notificationType: AttendanceNotificationType,
): Promise<ReminderSendOutcome> => {
  const contentSid = contentSidForType(notificationType);
  if (!contentSid) {
    console.info("[attendance-reminder] skipped notification because template SID is not configured", {
      notificationType,
      operationId: candidate.operationId,
      employeeId: candidate.employeeId,
    });
    return "skipped";
  }

  const scheduleVersion = candidate.scheduleVersion ?? 1;
  const claimed = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
    operationId: candidate.operationId,
    employeeId: candidate.employeeId,
    notificationType,
    scheduleVersion,
    reminderSource: "AUTOMATIC",
  });

  if (!claimed) {
    console.info("[attendance-reminder] skipped concurrent or non-retryable notification", {
      notificationType,
      operationId: candidate.operationId,
      employeeId: candidate.employeeId,
    });
    return "skipped";
  }

  if (!hasValidWhatsAppPhone(candidate.employeePhoneNumber)) {
    const errorMessage = "EMPLOYEE_WHATSAPP_PHONE_MISSING";
    await attendanceNotificationRepository.markFailed(companyId, {
      notificationId: claimed.id,
      errorMessage,
    });

    console.info("[attendance-reminder] reminder skipped because employee has no WhatsApp phone", {
      notificationType,
      operationId: candidate.operationId,
      employeeId: candidate.employeeId,
      notificationId: claimed.id,
    });

    return "failed";
  }

  if (notificationType === "NO_CHECKIN_AT_START") {
    const stillEligible = await attendanceNotificationRepository.isNoCheckInAtStartEligible(
      companyId,
      candidate.operationId,
      candidate.employeeId,
    );

    if (!stillEligible) {
      await attendanceNotificationRepository.markFailed(companyId, {
        notificationId: claimed.id,
        errorMessage: NO_LONGER_ELIGIBLE_FOR_NO_CHECKIN_AT_START,
      });

      console.info(
        "[attendance-reminder] skipped no-check-in notification because employee is no longer eligible",
        {
          notificationType,
          operationId: candidate.operationId,
          employeeId: candidate.employeeId,
          notificationId: claimed.id,
        },
      );

      return "skipped";
    }
  }

  if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER") {
    const stillEligible = await attendanceNotificationRepository.isConfirmationReminderEligible(
      companyId,
      candidate.operationId,
      candidate.employeeId,
      scheduleVersion,
    );

    if (!stillEligible) {
      await attendanceNotificationRepository.markFailed(companyId, {
        notificationId: claimed.id,
        errorMessage: NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_REMINDER,
      });

      console.info(
        "[attendance-reminder] skipped confirmation reminder because employee is no longer eligible",
        {
          notificationType,
          operationId: candidate.operationId,
          employeeId: candidate.employeeId,
          notificationId: claimed.id,
          scheduleVersion,
        },
      );

      return "skipped";
    }
  }

  let preparedSession: BotSession | null = null;
  if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER") {
    try {
      preparedSession = await botSessionService.createAttendanceConfirmationResponseSession(companyId, {
        employeeId: candidate.employeeId,
        phoneNumber: candidate.employeePhoneNumber,
        operationId: candidate.operationId,
        notificationId: claimed.id,
        scheduleVersion,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error preparing confirmation context";
      await attendanceNotificationRepository.markFailed(companyId, {
        notificationId: claimed.id,
        errorMessage,
      });

      console.error("[attendance-reminder] confirmation context preparation failed before send", {
        notificationType,
        operationId: candidate.operationId,
        employeeId: candidate.employeeId,
        notificationId: claimed.id,
        scheduleVersion,
        errorMessage,
      });

      return "failed";
    }

    if (!preparedSession) {
      console.warn("[attendance-reminder] confirmation context unavailable before send", {
        notificationType,
        operationId: candidate.operationId,
        employeeId: candidate.employeeId,
        notificationId: claimed.id,
        scheduleVersion,
        reason: "ACTIVE_SESSION_CONFLICT",
      });
    }
  }

  try {
    const contentVariables = buildTemplateVariables(candidate, notificationType);
    const result = await twilioOutboundService.sendWhatsAppTemplate({
      toPhoneNumber: candidate.employeePhoneNumber,
      contentSid,
      contentVariables,
    });

    const sentAt = new Date();

    try {
      await attendanceNotificationRepository.markSent(companyId, {
        notificationId: claimed.id,
        twilioMessageSid: result.messageSid,
        sentAt,
      });
    } catch (markSentError) {
      const errorMessage =
        markSentError instanceof Error ? markSentError.message : "Unknown error marking reminder sent";

      try {
        await attendanceNotificationRepository.markSentRecoveryRequired(companyId, {
          notificationId: claimed.id,
          twilioMessageSid: result.messageSid,
          sentAt,
          errorMessage,
        });

        console.error(
          "[attendance-reminder] post-send SENT persistence failed; recovery state recorded",
          {
            notificationType,
            operationId: candidate.operationId,
            employeeId: candidate.employeeId,
            notificationId: claimed.id,
            scheduleVersion,
            twilioMessageSid: result.messageSid,
            errorMessage,
          },
        );
      } catch (recoveryError) {
        const recoveryErrorMessage =
          recoveryError instanceof Error ? recoveryError.message : "Unknown recovery persistence error";

        console.error("[attendance-reminder] CRITICAL sent persistence unknown after Twilio delivery", {
          notificationType,
          companyId,
          operationId: candidate.operationId,
          employeeId: candidate.employeeId,
          notificationId: claimed.id,
          scheduleVersion,
          twilioMessageSid: result.messageSid,
          markSentError: errorMessage,
          recoveryError: recoveryErrorMessage,
          errorCode: SENT_PERSISTENCE_UNKNOWN_ERROR,
        });

        if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER" && !preparedSession) {
          return "sent_persistence_unknown";
        }

        return "sent_persistence_unknown";
      }

      if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER" && !preparedSession) {
        return "sent_context_failed";
      }

      return "sent";
    }

    console.info("[attendance-reminder] reminder sent", {
      notificationType,
      operationId: candidate.operationId,
      employeeId: candidate.employeeId,
      notificationId: claimed.id,
      scheduleVersion,
      twilioMessageSid: result.messageSid,
    });

    if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER" && !preparedSession) {
      console.error("[attendance-reminder] SENT_CONTEXT_FAILED after successful Twilio send", {
        notificationType,
        operationId: candidate.operationId,
        employeeId: candidate.employeeId,
        notificationId: claimed.id,
        scheduleVersion,
        errorMessage: SENT_CONTEXT_FAILED_ERROR,
      });
      return "sent_context_failed";
    }

    return "sent";
  } catch (error) {
    if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER" && preparedSession) {
      try {
        await botSessionService.cancelSession(companyId, preparedSession.id);
      } catch (cleanupError) {
        const cleanupErrorMessage =
          cleanupError instanceof Error ? cleanupError.message : "Unknown session cleanup error";

        console.error("[attendance-reminder] prepared session cleanup failed", {
          notificationType,
          operationId: candidate.operationId,
          employeeId: candidate.employeeId,
          notificationId: claimed.id,
          scheduleVersion,
          sessionId: preparedSession.id,
          errorMessage: cleanupErrorMessage,
        });
      }
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error sending attendance reminder";

    await attendanceNotificationRepository.markFailed(companyId, {
      notificationId: claimed.id,
      errorMessage,
    });

    console.error("[attendance-reminder] reminder failed", {
      notificationType,
      operationId: candidate.operationId,
      employeeId: candidate.employeeId,
      notificationId: claimed.id,
      errorMessage,
    });

    return "failed";
  }
};

const processCandidates = async (
  companyId: string,
  candidates: AttendanceReminderCandidate[],
  notificationType: AttendanceNotificationType,
): Promise<{ sent: number; failed: number; skipped: number }> => {
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      const outcome = await sendReminderForCandidate(companyId, candidate, notificationType);
      if (
        outcome === "sent" ||
        outcome === "sent_context_failed" ||
        outcome === "sent_persistence_unknown"
      ) {
        sent += 1;
      } else if (outcome === "failed") {
        failed += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      failed += 1;
      const errorMessage = error instanceof Error ? error.message : "Unknown candidate processing error";

      console.error("[attendance-reminder] unhandled candidate processing error", {
        companyId,
        operationId: candidate.operationId,
        employeeId: candidate.employeeId,
        notificationType,
        errorMessage,
      });
    }
  }

  return { sent, failed, skipped };
};

const mergeSummaries = (
  referenceAt: Date,
  summaries: AttendanceReminderRunSummary[],
): AttendanceReminderRunSummary =>
  summaries.reduce(
    (acc, summary) => ({
      referenceAt: referenceAt.toISOString(),
      arrivalCandidates: acc.arrivalCandidates + summary.arrivalCandidates,
      exitCandidates: acc.exitCandidates + summary.exitCandidates,
      noCheckInCandidates: acc.noCheckInCandidates + summary.noCheckInCandidates,
      confirmationCandidates: acc.confirmationCandidates + summary.confirmationCandidates,
      arrivalSent: acc.arrivalSent + summary.arrivalSent,
      exitSent: acc.exitSent + summary.exitSent,
      noCheckInSent: acc.noCheckInSent + summary.noCheckInSent,
      confirmationSent: acc.confirmationSent + summary.confirmationSent,
      arrivalFailed: acc.arrivalFailed + summary.arrivalFailed,
      exitFailed: acc.exitFailed + summary.exitFailed,
      noCheckInFailed: acc.noCheckInFailed + summary.noCheckInFailed,
      confirmationFailed: acc.confirmationFailed + summary.confirmationFailed,
      arrivalSkipped: acc.arrivalSkipped + summary.arrivalSkipped,
      exitSkipped: acc.exitSkipped + summary.exitSkipped,
      noCheckInSkipped: acc.noCheckInSkipped + summary.noCheckInSkipped,
      confirmationSkipped: acc.confirmationSkipped + summary.confirmationSkipped,
    }),
    emptySummary(referenceAt),
  );

export const attendanceReminderService = {
  isEnabled(): boolean {
    return env.ATTENDANCE_REMINDER_JOB_ENABLED && twilioOutboundService.isConfigured();
  },

  async runDueReminders(
    companyId: string,
    referenceAt: Date = new Date(),
  ): Promise<AttendanceReminderRunSummary> {
    if (!this.isEnabled()) {
      console.info("[attendance-reminder] job skipped because reminders are disabled or Twilio is not configured");
      return emptySummary(referenceAt);
    }

    const { windowStart, windowEnd } = buildReminderDueWindow(referenceAt);
    const startDueWindow = buildOperationStartDueWindow(referenceAt);

    await attendanceNotificationRepository.reconcileSentRecoveryRequired(companyId);

    const [arrivalCandidates, exitCandidates, noCheckInCandidates, confirmationCandidates] =
      await Promise.all([
      attendanceNotificationRepository.findArrivalReminderCandidates(companyId, { windowStart, windowEnd }),
      attendanceNotificationRepository.findExitReminderCandidates(companyId, { windowStart, windowEnd }),
      attendanceNotificationRepository.findNoCheckInAtStartCandidates(companyId, {
        windowStart: startDueWindow.windowStart,
        windowEnd: startDueWindow.windowEnd,
      }),
      attendanceNotificationRepository.findConfirmationReminderCandidates(companyId, referenceAt),
    ]);

    const arrivalResult = await processCandidates(
      companyId,
      arrivalCandidates,
      "ARRIVAL_REMINDER_15_MIN",
    );
    const exitResult = await processCandidates(companyId, exitCandidates, "EXIT_REMINDER_15_MIN");
    const noCheckInResult = await processCandidates(
      companyId,
      noCheckInCandidates,
      "NO_CHECKIN_AT_START",
    );
    const confirmationResult = await processCandidates(
      companyId,
      confirmationCandidates,
      "ATTENDANCE_CONFIRMATION_REMINDER",
    );

    const summary: AttendanceReminderRunSummary = {
      referenceAt: referenceAt.toISOString(),
      arrivalCandidates: arrivalCandidates.length,
      exitCandidates: exitCandidates.length,
      noCheckInCandidates: noCheckInCandidates.length,
      confirmationCandidates: confirmationCandidates.length,
      arrivalSent: arrivalResult.sent,
      exitSent: exitResult.sent,
      noCheckInSent: noCheckInResult.sent,
      confirmationSent: confirmationResult.sent,
      arrivalFailed: arrivalResult.failed,
      exitFailed: exitResult.failed,
      noCheckInFailed: noCheckInResult.failed,
      confirmationFailed: confirmationResult.failed,
      arrivalSkipped: arrivalResult.skipped,
      exitSkipped: exitResult.skipped,
      noCheckInSkipped: noCheckInResult.skipped,
      confirmationSkipped: confirmationResult.skipped,
    };

    console.info("[attendance-reminder] job completed", { companyId, ...summary });
    return summary;
  },

  async runDueRemindersForAllCompanies(referenceAt: Date = new Date()): Promise<AttendanceReminderRunSummary> {
    if (!this.isEnabled()) {
      console.info("[attendance-reminder] job skipped because reminders are disabled or Twilio is not configured");
      return emptySummary(referenceAt);
    }

    const companies = await companyRepository.listActive();
    const summaries = await Promise.all(
      companies.map((company) => this.runDueReminders(company.id, referenceAt)),
    );

    const merged = mergeSummaries(referenceAt, summaries);
    console.info("[attendance-reminder] all companies job completed", merged);
    return merged;
  },

  async sendTestReminder(
    companyId: string,
    input: {
      operationId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
    },
  ): Promise<ReminderSendOutcome> {
    const candidate = await attendanceNotificationRepository.findReminderCandidateByIds(companyId, input);
    if (!candidate) {
      throw new AppError(404, "REMINDER_CANDIDATE_NOT_FOUND", "No se encontró el empleado asignado a la operación");
    }

    if (input.notificationType === "EXIT_REMINDER_15_MIN") {
      const isEligible = await attendanceNotificationRepository.isExitReminderEligible(
        companyId,
        input.operationId,
        input.employeeId,
      );

      if (!isEligible) {
        throw new AppError(
          400,
          "EXIT_REMINDER_REQUIRES_CHECK_IN_WITHOUT_CHECKOUT",
          "El recordatorio de salida requiere un check-in sin check-out",
        );
      }
    }

    if (input.notificationType === "NO_CHECKIN_AT_START") {
      const isEligible = await attendanceNotificationRepository.isNoCheckInAtStartEligible(
        companyId,
        input.operationId,
        input.employeeId,
      );

      if (!isEligible) {
        throw new AppError(
          400,
          "NO_CHECKIN_AT_START_REQUIRES_MISSING_CHECK_IN",
          "La notificación de inicio requiere un empleado asignado sin registro de ingreso",
        );
      }
    }

    return sendReminderForCandidate(companyId, candidate, input.notificationType);
  },
};
