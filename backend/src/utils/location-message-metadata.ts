/**
 * Normalize Twilio WhatsApp inbound webhook forward flags for attendance security.
 *
 * Twilio contract (confirmed by Twilio docs for WhatsApp inbound webhooks):
 * - `Forwarded` = "true" when the message was forwarded
 * - `FrequentlyForwarded` = "true" when frequently forwarded
 *
 * Absent fields → false (normal non-forwarded message).
 * Invalid values → false (never invent true).
 */

export interface LocationMessageMetadata {
  isForwarded: boolean;
  isFrequentlyForwarded: boolean;
  sourceMessageSid: string;
}

const TRUE_VALUES = new Set(["true", "1"]);
const FALSE_VALUES = new Set(["false", "0"]);

/**
 * Parse Twilio form / boolean-ish values.
 * Returns true only for explicit truthy forms; absent/invalid → false.
 */
export const parseTwilioFlag = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return false;
};

export const extractLocationMessageMetadata = (
  payload: Record<string, unknown>,
): LocationMessageMetadata => {
  const sourceMessageSid =
    typeof payload.MessageSid === "string" && payload.MessageSid.trim()
      ? payload.MessageSid.trim()
      : "";

  return {
    isForwarded: parseTwilioFlag(payload.Forwarded),
    isFrequentlyForwarded: parseTwilioFlag(payload.FrequentlyForwarded),
    sourceMessageSid,
  };
};

/** Reject when Twilio marks the message as forwarded or frequently forwarded. */
export const isExplicitlyForwardedLocation = (metadata: LocationMessageMetadata): boolean =>
  metadata.isForwarded || metadata.isFrequentlyForwarded;
