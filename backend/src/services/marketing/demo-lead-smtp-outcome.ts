import type { EmailSendResult } from "../email.service";

/**
 * Maps `sendEmail` results to marketing demo delivery semantics.
 *
 * Contract with `email.service.ts`:
 * - **Accepted:** resolves with `sent === true` and `transport === "smtp"` (provider accepted the message).
 * - **Definitive reject:** resolves without throwing but not accepted (console/disabled, or `sent !== true`).
 *   Safe to release the dedup slot — no SMTP acceptance occurred, so a retry cannot double-deliver.
 * - **Uncertain:** `sendEmail` throws (timeout, disconnect, TLS, etc.). Dedup stays reserved; caller gets 503.
 */
export type MarketingSmtpOutcome =
  | { kind: "accepted"; result: EmailSendResult }
  | { kind: "rejected"; result: EmailSendResult }
  | { kind: "uncertain" };

export function classifyMarketingSmtpResult(result: EmailSendResult): MarketingSmtpOutcome {
  if (result.sent === true && result.transport === "smtp") {
    return { kind: "accepted", result };
  }
  return { kind: "rejected", result };
}

export function isDefinitiveMarketingDeliveryError(code: string): boolean {
  return code === "MARKETING_DEMO_DELIVERY_FAILED";
}

export const MARKETING_DEMO_DELIVERY_UNCERTAIN_CODE = "MARKETING_DEMO_DELIVERY_UNCERTAIN";
export const MARKETING_DEMO_DELIVERY_FAILED_CODE = "MARKETING_DEMO_DELIVERY_FAILED";