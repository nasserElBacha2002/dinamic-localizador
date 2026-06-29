import { env } from "../config/env";
import type { AttendanceNotificationType } from "../constants/attendance-notification";
import { AppError } from "../errors/app-error";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import type { AttendanceReminderCandidate } from "../types/attendance-notification";
import { buildAttendanceReminderTemplateVariables } from "../utils/attendance-reminder-template";
import { buildReminderDueWindow } from "../utils/reminder-time-window";
import { twilioOutboundService } from "./twilio-outbound.service";

export interface AttendanceReminderRunSummary {
  referenceAt: string;
  arrivalCandidates: number;
  exitCandidates: number;
  arrivalSent: number;
  exitSent: number;
  arrivalFailed: number;
  exitFailed: number;
  arrivalSkipped: number;
  exitSkipped: number;
}

const contentSidForType = (notificationType: AttendanceNotificationType): string => {
  if (notificationType === "ARRIVAL_REMINDER_15_MIN") {
    if (!env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID) {
      throw new Error("TWILIO_ARRIVAL_REMINDER_CONTENT_SID_NOT_CONFIGURED");
    }

    return env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID;
  }

  if (!env.TWILIO_EXIT_REMINDER_CONTENT_SID) {
    throw new Error("TWILIO_EXIT_REMINDER_CONTENT_SID_NOT_CONFIGURED");
  }

  return env.TWILIO_EXIT_REMINDER_CONTENT_SID;
};

const buildTemplateVariables = (
  candidate: AttendanceReminderCandidate,
  notificationType: AttendanceNotificationType,
): Record<string, string> =>
  buildAttendanceReminderTemplateVariables(candidate, notificationType, env.BOT_OPERATION_TIMEZONE);

const sendReminderForCandidate = async (
  candidate: AttendanceReminderCandidate,
  notificationType: AttendanceNotificationType,
): Promise<"sent" | "failed" | "skipped"> => {
  const claimed = await attendanceNotificationRepository.claimNotificationForAttempt({
    inventoryId: candidate.inventoryId,
    employeeId: candidate.employeeId,
    notificationType,
  });

  if (!claimed) {
    console.info("[attendance-reminder] skipped concurrent or non-retryable notification", {
      notificationType,
      inventoryId: candidate.inventoryId,
      employeeId: candidate.employeeId,
    });
    return "skipped";
  }

  try {
    const contentSid = contentSidForType(notificationType);
    const contentVariables = buildTemplateVariables(candidate, notificationType);
    const result = await twilioOutboundService.sendWhatsAppTemplate({
      toPhoneNumber: candidate.employeePhoneNumber,
      contentSid,
      contentVariables,
    });

    const sentAt = new Date();
    await attendanceNotificationRepository.markSent({
      notificationId: claimed.id,
      twilioMessageSid: result.messageSid,
      sentAt,
    });

    console.info("[attendance-reminder] reminder sent", {
      notificationType,
      inventoryId: candidate.inventoryId,
      employeeId: candidate.employeeId,
      notificationId: claimed.id,
      twilioMessageSid: result.messageSid,
    });

    return "sent";
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error sending attendance reminder";

    await attendanceNotificationRepository.markFailed({
      notificationId: claimed.id,
      errorMessage,
    });

    console.error("[attendance-reminder] reminder failed", {
      notificationType,
      inventoryId: candidate.inventoryId,
      employeeId: candidate.employeeId,
      notificationId: claimed.id,
      errorMessage,
    });

    return "failed";
  }
};

const processCandidates = async (
  candidates: AttendanceReminderCandidate[],
  notificationType: AttendanceNotificationType,
): Promise<{ sent: number; failed: number; skipped: number }> => {
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const outcome = await sendReminderForCandidate(candidate, notificationType);
    if (outcome === "sent") {
      sent += 1;
    } else if (outcome === "failed") {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return { sent, failed, skipped };
};

export const attendanceReminderService = {
  isEnabled(): boolean {
    return env.ATTENDANCE_REMINDER_JOB_ENABLED && twilioOutboundService.isConfigured();
  },

  async runDueReminders(referenceAt: Date = new Date()): Promise<AttendanceReminderRunSummary> {
    if (!this.isEnabled()) {
      console.info("[attendance-reminder] job skipped because reminders are disabled or Twilio is not configured");
      return {
        referenceAt: referenceAt.toISOString(),
        arrivalCandidates: 0,
        exitCandidates: 0,
        arrivalSent: 0,
        exitSent: 0,
        arrivalFailed: 0,
        exitFailed: 0,
        arrivalSkipped: 0,
        exitSkipped: 0,
      };
    }

    const { windowStart, windowEnd } = buildReminderDueWindow(referenceAt);

    const [arrivalCandidates, exitCandidates] = await Promise.all([
      attendanceNotificationRepository.findArrivalReminderCandidates({ windowStart, windowEnd }),
      attendanceNotificationRepository.findExitReminderCandidates({ windowStart, windowEnd }),
    ]);

    const arrivalResult = await processCandidates(arrivalCandidates, "ARRIVAL_REMINDER_15_MIN");
    const exitResult = await processCandidates(exitCandidates, "EXIT_REMINDER_15_MIN");

    const summary: AttendanceReminderRunSummary = {
      referenceAt: referenceAt.toISOString(),
      arrivalCandidates: arrivalCandidates.length,
      exitCandidates: exitCandidates.length,
      arrivalSent: arrivalResult.sent,
      exitSent: exitResult.sent,
      arrivalFailed: arrivalResult.failed,
      exitFailed: exitResult.failed,
      arrivalSkipped: arrivalResult.skipped,
      exitSkipped: exitResult.skipped,
    };

    console.info("[attendance-reminder] job completed", summary);
    return summary;
  },

  async sendTestReminder(input: {
    inventoryId: string;
    employeeId: string;
    notificationType: AttendanceNotificationType;
  }): Promise<"sent" | "failed" | "skipped"> {
    const candidate = await attendanceNotificationRepository.findReminderCandidateByIds(input);
    if (!candidate) {
      throw new AppError(404, "REMINDER_CANDIDATE_NOT_FOUND", "No se encontró el empleado asignado al inventario");
    }

    if (input.notificationType === "EXIT_REMINDER_15_MIN") {
      const isEligible = await attendanceNotificationRepository.isExitReminderEligible(
        input.inventoryId,
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

    return sendReminderForCandidate(candidate, input.notificationType);
  },
};
