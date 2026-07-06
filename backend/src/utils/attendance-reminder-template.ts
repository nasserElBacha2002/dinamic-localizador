import type { AttendanceNotificationType } from "../constants/attendance-notification";
import type { AttendanceReminderCandidate } from "../types/attendance-notification";
import { formatLocalTime } from "./attendance-validation";
import { formatServiceReferenceFromFields } from "./format-service-reference";

const formatLocalDate = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

export const buildReminderServiceReference = (
  candidate: Pick<
    AttendanceReminderCandidate,
    "serviceName" | "serviceAddress" | "serviceLocality"
  >,
): string => formatServiceReferenceFromFields(candidate);

export const buildAttendanceReminderTemplateVariables = (
  candidate: AttendanceReminderCandidate,
  notificationType: AttendanceNotificationType,
  timeZone: string,
): Record<string, string> => {
  const serviceReference = buildReminderServiceReference(candidate);

  if (notificationType === "NO_CHECKIN_AT_START") {
    return {
      "1": candidate.employeeName,
      "2": serviceReference,
    };
  }

  if (notificationType === "ATTENDANCE_CONFIRMATION_REMINDER") {
    return {
      "1": candidate.employeeName,
      "2": serviceReference,
      "3": formatLocalDate(candidate.scheduledStart, timeZone),
      "4": formatLocalTime(candidate.scheduledStart, timeZone),
    };
  }

  const scheduleIso =
    notificationType === "ARRIVAL_REMINDER_15_MIN"
      ? candidate.scheduledStart
      : candidate.scheduledEnd;

  if (!scheduleIso) {
    throw new Error("MISSING_SCHEDULE_TIME_FOR_REMINDER");
  }

  return {
    "1": candidate.employeeName,
    "2": serviceReference,
    "3": formatLocalTime(scheduleIso, timeZone),
  };
};
