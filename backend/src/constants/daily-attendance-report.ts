export const DAILY_ATTENDANCE_REPORT_RUN_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "PARTIAL",
  "FAILED",
  "SKIPPED_NO_RECIPIENTS",
  "SKIPPED_NO_ACTIVITY",
] as const;

export type DailyAttendanceReportRunStatus =
  (typeof DAILY_ATTENDANCE_REPORT_RUN_STATUSES)[number];

export const DAILY_ATTENDANCE_REPORT_DELIVERY_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
] as const;

export type DailyAttendanceReportDeliveryStatus =
  (typeof DAILY_ATTENDANCE_REPORT_DELIVERY_STATUSES)[number];

/** Default local send time when column is missing / unset in older rows. */
export const DAILY_ATTENDANCE_REPORT_DEFAULT_TIME = "08:00";

/** Catch-up window: do not enqueue report dates older than this many local days. */
export const DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS = 3;
