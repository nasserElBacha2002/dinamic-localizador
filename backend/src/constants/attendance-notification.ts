export const ATTENDANCE_NOTIFICATION_TYPES = [
  "ARRIVAL_REMINDER_15_MIN",
  "EXIT_REMINDER_15_MIN",
  "NO_CHECKIN_AT_START",
] as const;

export type AttendanceNotificationType = (typeof ATTENDANCE_NOTIFICATION_TYPES)[number];

export const ATTENDANCE_NOTIFICATION_STATUSES = ["PENDING", "SENT", "FAILED"] as const;

export type AttendanceNotificationStatus = (typeof ATTENDANCE_NOTIFICATION_STATUSES)[number];

export const ATTENDANCE_REMINDER_LEAD_MINUTES = 15;
export const ATTENDANCE_REMINDER_MAX_ATTEMPTS = 3;
export const ATTENDANCE_REMINDER_STALE_PENDING_MINUTES = 5;
export const NO_CHECKIN_AT_START_WINDOW_MINUTES = 1;

export const NO_LONGER_ELIGIBLE_FOR_NO_CHECKIN_AT_START =
  "NO_LONGER_ELIGIBLE_FOR_NO_CHECKIN_AT_START";

export const ATTENDANCE_NOTIFICATION_TYPE_LABELS: Record<AttendanceNotificationType, string> = {
  ARRIVAL_REMINDER_15_MIN: "Recordatorio de llegada (15 min)",
  EXIT_REMINDER_15_MIN: "Recordatorio de salida (15 min)",
  NO_CHECKIN_AT_START: "Sin registro de ingreso al inicio",
};
