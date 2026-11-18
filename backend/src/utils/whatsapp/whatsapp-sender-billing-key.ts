import { createHash } from "node:crypto";
import { tryNormalizeWhatsAppPhone } from "../phone";

/**
 * Stable billing scope key for Meta SERVICE free tier (per sender number / month).
 * Uses normalized E.164 — never masked phone strings.
 */
export const buildSenderBillingKey = (phone: string | null | undefined): string | null => {
  if (!phone?.trim()) {
    return null;
  }
  const withPrefix = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
  const normalized = tryNormalizeWhatsAppPhone(withPrefix);
  if (!normalized) {
    return null;
  }
  return createHash("sha256").update(normalized, "utf8").digest("hex");
};