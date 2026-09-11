export const MESSAGE_COST_QUALITIES = [
  "CONFIRMED",
  "ESTIMATED",
  "PENDING",
  "UNAVAILABLE",
] as const;

export type MessageCostQuality = (typeof MESSAGE_COST_QUALITIES)[number];

export const MESSAGE_COST_SOURCES = [
  "TWILIO_MESSAGE_RESOURCE",
  "TARIFF_TABLE",
  "NONE",
  "HISTORICAL_BACKFILL",
] as const;

export type MessageCostSource = (typeof MESSAGE_COST_SOURCES)[number];

export const MESSAGE_COST_KINDS = [
  "TEMPLATE",
  "DOCUMENT",
  "TEXT",
  "BOT_TWIML",
  "OTHER",
] as const;

export type MessageCostKind = (typeof MESSAGE_COST_KINDS)[number];

export const MESSAGE_COST_FLOW_LABELS = [
  "ARRIVAL_REMINDER",
  "EXIT_REMINDER",
  "NO_CHECKIN",
  "ATTENDANCE_CONFIRMATION",
  "ADMIN_ALERT",
  "PAYROLL_AVAILABLE",
  "PAYROLL_DOCUMENT",
  "OPERATION_ASSIGNMENT",
  "OTHER",
] as const;

export type MessageCostFlowLabel = (typeof MESSAGE_COST_FLOW_LABELS)[number];

/**
 * Billing scope for amounts stored in the ledger.
 * Twilio Message.price is the channel/messaging fee only.
 * Meta WhatsApp conversation/template fees are billed separately via Usage
 * and are intentionally excluded unless a verified Usage API path is added.
 */
export const MESSAGE_COST_BILLING_SCOPE =
  "TWILIO_MESSAGE_CHANNEL_FEE_ONLY_EXCLUDES_META_TEMPLATE_FEES" as const;
