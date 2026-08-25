/**
 * Normalize Twilio WhatsApp inbound webhook forward flags for attendance security.
 *
 * Authoritative fields only (Twilio contract):
 * - `Forwarded`
 * - `FrequentlyForwarded`
 *
 * ChannelMetadata must never drive enforcement.
 * Absent / invalid values → false (do not invent true). Best-effort protection.
 */

export interface LocationMessageMetadata {
  isForwarded: boolean;
  isFrequentlyForwarded: boolean;
  sourceMessageSid: string;
}

const TRUE_VALUES = new Set(["true", "1"]);
const FALSE_VALUES = new Set(["false", "0", ""]);

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
  if (value == null) {
    return false;
  }
  if (typeof value !== "string") {
    console.warn("[location-message-metadata] unexpected Forwarded flag type", {
      valueType: typeof value,
    });
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  console.warn("[location-message-metadata] unexpected Forwarded flag value", {
    valuePreview: normalized.slice(0, 32),
  });
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
