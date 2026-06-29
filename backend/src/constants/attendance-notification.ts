export const ATTENDANCE_NOTIFICATION_TYPES = [
  "ARRIVAL_REMINDER_15_MIN",
  "EXIT_REMINDER_15_MIN",
] as const;

export type AttendanceNotificationType = (typeof ATTENDANCE_NOTIFICATION_TYPES)[number];

export const ATTENDANCE_NOTIFICATION_STATUSES = ["PENDING", "SENT", "FAILED"] as const;

export type AttendanceNotificationStatus = (typeof ATTENDANCE_NOTIFICATION_STATUSES)[number];

export const ATTENDANCE_REMINDER_LEAD_MINUTES = 15;
export const ATTENDANCE_REMINDER_MAX_ATTEMPTS = 3;
export const ATTENDANCE_REMINDER_STALE_PENDING_MINUTES = 5;
