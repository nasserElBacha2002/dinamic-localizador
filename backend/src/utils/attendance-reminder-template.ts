import type { AttendanceNotificationType } from "../constants/attendance-notification";
import type { AttendanceReminderCandidate } from "../types/attendance-notification";
import { formatLocalTime } from "./attendance-validation";

export const buildAttendanceReminderTemplateVariables = (
  candidate: AttendanceReminderCandidate,
  notificationType: AttendanceNotificationType,
  timeZone: string,
): Record<string, string> => {
  const scheduleIso =
    notificationType === "ARRIVAL_REMINDER_15_MIN"
      ? candidate.scheduledStart
      : candidate.scheduledEnd;

  if (!scheduleIso) {
    throw new Error("MISSING_SCHEDULE_TIME_FOR_REMINDER");
  }

  return {
    "1": candidate.employeeName,
    "2": candidate.storeName,
    "3": formatLocalTime(scheduleIso, timeZone),
  };
};
