import { createHmac } from "node:crypto";
import { env } from "../../config/env";
import { normalizeEmail } from "../password";

const MARKETING_EMAIL_KEY_PREFIX = "marketing-demo-email-v1:";

/** Opaque per-email bucket key (HMAC; no plaintext address in rate_limit_buckets). */
export function marketingDemoEmailRateLimitKey(rawEmail: string): string {
  const normalized = normalizeEmail(rawEmail);
  const digest = createHmac("sha256", env.JWT_SECRET)
    .update(`${MARKETING_EMAIL_KEY_PREFIX}${normalized}`)
    .digest("hex");
  return `marketing-demo-email:${digest}`;
}