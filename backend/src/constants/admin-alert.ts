export const ADMIN_ALERT_TYPES = [
  "EMPLOYEE_UNAVAILABLE",
  "MISSING_CHECKIN_AFTER_OPERATION",
  "FORWARDED_LOCATION_REJECTED",
  "ABSENCE_REQUEST_PENDING",
  "ATTENDANCE_THRESHOLD_CROSSED",
] as const;

export type AdminAlertType = (typeof ADMIN_ALERT_TYPES)[number];

export const ADMIN_ALERT_TEMPLATE_CATEGORIES = [
  "OPERATIONAL",
  "REQUEST",
  "SECURITY",
] as const;

export type AdminAlertTemplateCategory = (typeof ADMIN_ALERT_TEMPLATE_CATEGORIES)[number];

export const ADMIN_ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;

export type AdminAlertSeverity = (typeof ADMIN_ALERT_SEVERITIES)[number];

export const ADMIN_ALERT_NOTIFICATION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SEND_STARTED",
  "SEND_ACCEPTED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
  "RECONCILIATION_REQUIRED",
  "SENT_RECOVERY_REQUIRED",
] as const;

export type AdminAlertNotificationStatus = (typeof ADMIN_ALERT_NOTIFICATION_STATUSES)[number];

export const ADMIN_ALERT_SEND_ATTEMPT_STATUSES = [
  "STARTED",
  "PROVIDER_ACCEPTED",
  "PROVIDER_FAILED",
  "AMBIGUOUS",
] as const;

export type AdminAlertSendAttemptStatus = (typeof ADMIN_ALERT_SEND_ATTEMPT_STATUSES)[number];

export const ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS = 5;

export const ADMIN_ALERT_CATEGORY_PREFERENCE_COLUMN: Record<
  AdminAlertTemplateCategory,
  "receiveOperationalAlerts" | "receiveRequestAlerts" | "receiveSecurityAlerts"
> = {
  OPERATIONAL: "receiveOperationalAlerts",
  REQUEST: "receiveRequestAlerts",
  SECURITY: "receiveSecurityAlerts",
};

export const adminAlertTypeDefaultCategory = (
  alertType: AdminAlertType,
): AdminAlertTemplateCategory => {
  switch (alertType) {
    case "FORWARDED_LOCATION_REJECTED":
      return "SECURITY";
    case "ABSENCE_REQUEST_PENDING":
      return "REQUEST";
    case "EMPLOYEE_UNAVAILABLE":
    case "MISSING_CHECKIN_AFTER_OPERATION":
    case "ATTENDANCE_THRESHOLD_CROSSED":
    default:
      return "OPERATIONAL";
  }
};

/** User-facing status copy for pending absence request admin alerts. */
export const ABSENCE_REQUEST_PENDING_STATUS_LABEL = "Pendiente de revisión";
