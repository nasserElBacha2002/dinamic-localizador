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
  "FAILED_TERMINAL",
] as const;

export type DailyAttendanceReportDeliveryStatus =
  (typeof DAILY_ATTENDANCE_REPORT_DELIVERY_STATUSES)[number];

/** Default local send time when column is missing / unset in older rows. */
export const DAILY_ATTENDANCE_REPORT_DEFAULT_TIME = "08:00";

/** Catch-up window: do not enqueue report dates older than this many local days. */
export const DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS = 3;

/** Bump when email HTML/text layout changes (stored on run snapshot). */
export const DAILY_ATTENDANCE_REPORT_TEMPLATE_VERSION = "v1";

/** Max incidents embedded in the email body (totals still reflect full count). */
export const DAILY_ATTENDANCE_REPORT_MAX_INCIDENTS_IN_EMAIL = 40;
