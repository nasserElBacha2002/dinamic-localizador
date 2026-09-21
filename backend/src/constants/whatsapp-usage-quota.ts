/**
 * WhatsApp usage quotas (Phase 2) — defaults and allowlists.
 * Zero is a hard block for that control (not "unlimited").
 * Disable a control via explicit mode OFF / notice flag — never overload zero.
 */

export const WHATSAPP_QUOTA_MODES = ["OFF", "SHADOW", "ENFORCE"] as const;
export type WhatsAppQuotaMode = (typeof WHATSAPP_QUOTA_MODES)[number];

export const WHATSAPP_QUOTA_DEFAULTS = {
  dailyTurns: 20,
  weeklyTurns: 60,
  burstTurns: 5,
  burstWindowSeconds: 60,
  dailyOutbounds: 40,
  weeklyOutbounds: 120,
  companyDailyOutbounds: 500,
  limitNoticeEnabled: true,
  /** Absolute caps for config validation. */
  maxDailyTurns: 10_000,
  maxWeeklyTurns: 50_000,
  maxBurstTurns: 1_000,
  maxBurstWindowSeconds: 3_600,
  /** Minimum burst window (seconds). */
  minBurstWindowSeconds: 1,
  maxDailyOutbounds: 20_000,
  maxWeeklyOutbounds: 100_000,
  maxCompanyDailyOutbounds: 500_000,
} as const;

export const WHATSAPP_QUOTA_TURN_DECISIONS = [
  "ADMITTED",
  "REJECTED",
  "EXEMPT_CRITICAL",
  "SHADOW_WOULD_ADMIT",
  "SHADOW_WOULD_REJECT",
  "QUOTA_FAILURE",
  "AMBIGUOUS_HELD",
  "DUPLICATE",
] as const;
export type WhatsAppQuotaTurnDecision = (typeof WHATSAPP_QUOTA_TURN_DECISIONS)[number];

export const WHATSAPP_QUOTA_OUTBOUND_STATUSES = [
  "RESERVED",
  "ATTEMPT_STARTED",
  "RESPONSE_BUILT",
  "ACCEPTED",
  "RELEASED",
  "AMBIGUOUS",
  "SHADOW_WOULD_ADMIT",
  "SHADOW_WOULD_REJECT",
] as const;
export type WhatsAppQuotaOutboundStatus = (typeof WHATSAPP_QUOTA_OUTBOUND_STATUSES)[number];

export const WHATSAPP_QUOTA_REASON_CODES = {
  EXEMPT_CRITICAL: "EXEMPT_CRITICAL",
  ADMITTED: "ADMITTED",
  BLOCKED_DAILY_TURNS: "BLOCKED_DAILY_TURNS",
  BLOCKED_WEEKLY_TURNS: "BLOCKED_WEEKLY_TURNS",
  BLOCKED_BURST: "BLOCKED_BURST",
  BLOCKED_DAILY_OUTBOUNDS: "BLOCKED_DAILY_OUTBOUNDS",
  BLOCKED_WEEKLY_OUTBOUNDS: "BLOCKED_WEEKLY_OUTBOUNDS",
  BLOCKED_COMPANY_DAILY_OUTBOUNDS: "BLOCKED_COMPANY_DAILY_OUTBOUNDS",
  QUOTA_FAILURE: "QUOTA_FAILURE",
  AMBIGUOUS_HELD: "AMBIGUOUS_HELD",
  DUPLICATE: "DUPLICATE",
  NOTICE_SUPPRESSED_NO_BUDGET: "NOTICE_SUPPRESSED_NO_BUDGET",
  NOTICE_RESERVED: "NOTICE_RESERVED",
  MODE_OFF: "MODE_OFF",
  POLICY_LOAD_FAILED: "POLICY_LOAD_FAILED",
} as const;
