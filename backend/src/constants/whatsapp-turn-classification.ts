/**
 * WhatsApp turn classification (Phase 1 shadow) — constants and allowlists.
 * Rule version bumps when classification semantics change.
 */

export const WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION = "v3";

export const WHATSAPP_TURN_ORIGINS = ["EMPLOYEE", "SYSTEM", "UNKNOWN"] as const;
export type WhatsAppTurnOrigin = (typeof WHATSAPP_TURN_ORIGINS)[number];

export const WHATSAPP_TURN_CLASSIFICATIONS = [
  "CRITICAL_EXEMPT",
  "EMPLOYEE_LIMITED",
  "SYSTEM_EXEMPT",
  "AMBIGUOUS",
] as const;
export type WhatsAppTurnClassification =
  (typeof WHATSAPP_TURN_CLASSIFICATIONS)[number];

export const WHATSAPP_SYSTEM_INTERACTION_STATUSES = [
  "PREPARED",
  "ACTIVE",
  "SEND_FAILED",
  "SEND_AMBIGUOUS",
  "CONSUMED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type WhatsAppSystemInteractionStatus =
  (typeof WHATSAPP_SYSTEM_INTERACTION_STATUSES)[number];

export const WHATSAPP_SYSTEM_INTERACTION_TERMINAL_STATUSES = [
  "CONSUMED",
  "EXPIRED",
  "CANCELLED",
  "SEND_FAILED",
] as const;

/** Categories that open durable context (employee may reply). */
export const WHATSAPP_SYSTEM_INTERACTION_CATEGORIES = [
  "ARRIVAL_REMINDER",
  "EXIT_REMINDER",
  "NO_CHECKIN_REMINDER",
  "ATTENDANCE_CONFIRMATION",
  "OPERATION_ASSIGNMENT",
] as const;
export type WhatsAppSystemInteractionCategory =
  (typeof WHATSAPP_SYSTEM_INTERACTION_CATEGORIES)[number];

export const CRITICAL_SESSION_STATES = [
  "WAITING_LOCATION",
  "WAITING_OPERATION_SELECTION",
  "WAITING_CHECKOUT_LOCATION",
  "WAITING_CHECKOUT_OPERATION_SELECTION",
  "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE",
  "WAITING_CONFIRM_ATTENDANCE_SELECTION",
  "WAITING_UNAVAILABILITY_SELECTION",
] as const;

export const LIMITED_SESSION_STATES = [
  "WAITING_MENU_SELECTION",
  "WAITING_ABSENCE_TYPE",
  "WAITING_ABSENCE_START_DATE",
  "WAITING_ABSENCE_END_DATE",
  "WAITING_ABSENCE_REASON",
  "WAITING_ABSENCE_CONFIRMATION",
  "WAITING_PAYROLL_RECEIPT_PERIOD",
] as const;

export const CRITICAL_RESOLVED_INTENTS = [
  "arrival",
  "checkout",
  "confirm_attendance",
  "report_unavailability",
] as const;

export const LIMITED_RESOLVED_INTENTS = [
  "absence",
  "payroll_receipt",
  "workday",
  "upcoming_assignments",
  "menu",
  "greeting",
  "help",
  "unknown",
] as const;

export const CRITICAL_FLOW_TYPES = [
  "CHECKIN",
  "CHECKOUT",
  "ATTENDANCE_CONFIRMATION_RESPONSE",
  "CONFIRMATION",
  "LOCATION_SECURITY",
] as const;

export const LIMITED_FLOW_TYPES = [
  "MENU",
  "WORKDAY_QUERY",
  "UPCOMING_ASSIGNMENTS",
  "PAYROLL_RECEIPT_QUERY",
  "ABSENCE",
] as const;

/** Shadow auxiliary work must not hold the Twilio webhook response. */
export const WHATSAPP_TURN_SHADOW_BUDGET_MS = 200;

/**
 * Result codes that complete the operational reply to a SYSTEM interaction.
 * Invalid inputs / prompts for location do NOT consume.
 */
export const SYSTEM_INTERACTION_CONSUME_RESULT_CODES = [
  "CHECKIN_COMPLETED",
  "CHECKOUT_COMPLETED",
  "CHECKOUT_WITHOUT_ARRIVAL",
  "ATTENDANCE_CONFIRMATION_CONFIRMED",
  "ATTENDANCE_CONFIRMATION_UNAVAILABLE",
  "CONFIRMATION_FLOW",
] as const;
