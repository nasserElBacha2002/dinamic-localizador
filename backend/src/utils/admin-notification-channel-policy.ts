import type { AdminAlertType } from "../constants/admin-alert";

export const ADMIN_ALERT_DELIVERY_MODES = ["WHATSAPP_LEGACY", "DAILY_EMAIL"] as const;
export type AdminAlertDeliveryMode = (typeof ADMIN_ALERT_DELIVERY_MODES)[number];

export const ADMIN_NOTIFICATION_CHANNELS = [
  "WHATSAPP_URGENT",
  "DAILY_REPORT_ONLY",
  "AUDIT_ONLY",
] as const;
export type AdminNotificationChannel = (typeof ADMIN_NOTIFICATION_CHANNELS)[number];

/** Alert types that remain WhatsApp under DAILY_EMAIL. */
export const ADMIN_WHATSAPP_URGENT_ALERT_TYPES = [
  "EMPLOYEE_UNAVAILABLE",
  "ATTENDANCE_THRESHOLD_CROSSED",
] as const satisfies readonly AdminAlertType[];

/** Informational attendance alerts absorbed by the daily email report. */
export const ADMIN_DAILY_REPORT_ALERT_TYPES = [
  "ATTENDANCE_CONFIRMATION_MISSING",
  "MISSING_CHECKIN_AFTER_START",
  "MISSING_CHECKOUT_AFTER_END",
] as const satisfies readonly AdminAlertType[];

export type DecideAdminNotificationChannelInput = {
  mode: AdminAlertDeliveryMode;
  alertType: string;
  /**
   * Explicit separate security-channel config. When false/undefined under DAILY_EMAIL,
   * FORWARDED_LOCATION_REJECTED is AUDIT_ONLY (strict mode).
   */
  securityWhatsAppEnabled?: boolean;
};

/**
 * Single policy for live emit, reconciliation, materialization, and delivery.
 * Unknown types → AUDIT_ONLY (fail closed for WhatsApp).
 */
export function decideAdminNotificationChannel(
  input: DecideAdminNotificationChannelInput,
): AdminNotificationChannel {
  const { mode, alertType, securityWhatsAppEnabled } = input;

  if (alertType === "MISSING_CHECKIN_AFTER_OPERATION") {
    return "AUDIT_ONLY";
  }

  if (
    (ADMIN_WHATSAPP_URGENT_ALERT_TYPES as readonly string[]).includes(alertType)
  ) {
    return "WHATSAPP_URGENT";
  }

  if (mode === "WHATSAPP_LEGACY") {
    if ((ADMIN_DAILY_REPORT_ALERT_TYPES as readonly string[]).includes(alertType)) {
      return "WHATSAPP_URGENT"; // legacy: still WhatsApp (informational but WA channel)
    }
    if (alertType === "ABSENCE_REQUEST_PENDING" || alertType === "FORWARDED_LOCATION_REJECTED") {
      return "WHATSAPP_URGENT";
    }
    return "AUDIT_ONLY";
  }

  // DAILY_EMAIL
  if ((ADMIN_DAILY_REPORT_ALERT_TYPES as readonly string[]).includes(alertType)) {
    return "DAILY_REPORT_ONLY";
  }

  // Pending absence request is not a second urgent WhatsApp under the two-urgency rule.
  if (alertType === "ABSENCE_REQUEST_PENDING") {
    return "AUDIT_ONLY";
  }

  if (alertType === "FORWARDED_LOCATION_REJECTED") {
    return securityWhatsAppEnabled === true ? "WHATSAPP_URGENT" : "AUDIT_ONLY";
  }

  return "AUDIT_ONLY";
}

export function shouldMaterializeAdminWhatsApp(
  input: DecideAdminNotificationChannelInput,
): boolean {
  return decideAdminNotificationChannel(input) === "WHATSAPP_URGENT";
}

export function isInformationalAdminAlertType(alertType: string): boolean {
  return (ADMIN_DAILY_REPORT_ALERT_TYPES as readonly string[]).includes(alertType);
}
