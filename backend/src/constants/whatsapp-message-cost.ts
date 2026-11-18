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
  "META_POLICY",
] as const;

export const META_BILLING_CATEGORIES = [
  "NONE_INBOUND",
  "SERVICE",
  "MARKETING",
  "UTILITY",
  "AUTHENTICATION",
  "UNCLASSIFIED",
] as const;

export type MetaBillingCategory = (typeof META_BILLING_CATEGORIES)[number];

export const META_TARIFF_CATEGORIES = {
  SERVICE: "META_SERVICE",
  MARKETING: "META_MARKETING",
  UTILITY: "META_UTILITY",
  AUTHENTICATION: "META_AUTHENTICATION",
} as const satisfies Record<
  Exclude<MetaBillingCategory, "NONE_INBOUND" | "UNCLASSIFIED">,
  string
>;

/** Meta per-message SERVICE free tier (Twilio help center, effective 2026-10-01). */
export const META_SERVICE_FREE_TIER_EFFECTIVE_ISO = "2026-10-01T00:00:00.000Z";
export const META_SERVICE_FREE_MESSAGES_PER_SENDER_MONTH = 1000;

/** Twilio reference channel fee (USD); used only for ESTIMATED when Message.price is absent. */
export const TWILIO_WHATSAPP_CHANNEL_REFERENCE_USD = "0.005";

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
  "OTHER",
] as const;

export type MessageCostFlowLabel = (typeof MESSAGE_COST_FLOW_LABELS)[number];

/**
 * Ledger stores Twilio channel fees (Message.price) and Meta fees (tariff table / policy) separately.
 * Totals in the API sum both components; neither alone equals the full WhatsApp invoice without validation.
 */
export const MESSAGE_COST_BILLING_SCOPE = "TWILIO_CHANNEL_PLUS_META_ESTIMATED_COMPONENTS" as const;
