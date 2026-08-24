/**
 * Normalize Twilio/WhatsApp location webhook metadata for attendance security.
 *
 * Evidence status (ROOT-1):
 * - Meta Cloud API documents `context.forwarded` / `context.frequently_forwarded`.
 * - This app receives Twilio form-urlencoded webhooks with Zod `.passthrough()`.
 * - Exact Twilio field names for WhatsApp forwards are NOT proven in this repo yet.
 *
 * Detection therefore probes multiple known candidate keys / JSON blobs without
 * treating missing metadata as "not forwarded".
 */

export type ForwardDetectionStatus = "FORWARDED" | "NOT_FORWARDED" | "UNKNOWN";

export interface LocationMessageMetadata {
  /** true / false when an explicit signal exists; null when absent (unknown). */
  isForwarded: boolean | null;
  isFrequentlyForwarded: boolean | null;
  sourceMessageSid: string;
  /** Structured status for logs / forensics (never invents false). */
  forwardDetection: ForwardDetectionStatus;
  /** Payload keys that contributed a boolean signal (for observability). */
  signalKeysFound: string[];
}

const TRUE_VALUES = new Set(["true", "1", "yes", "y"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n"]);

/** Candidate top-level keys seen in Meta naming or Twilio PascalCase conventions. */
const FORWARDED_KEYS = [
  "Forwarded",
  "forwarded",
  "WhatsappForwarded",
  "WhatsAppForwarded",
  "IsForwarded",
  "is_forwarded",
  "IsForwardedMessage",
] as const;

const FREQUENTLY_FORWARDED_KEYS = [
  "FrequentlyForwarded",
  "frequently_forwarded",
  "WhatsappFrequentlyForwarded",
  "WhatsAppFrequentlyForwarded",
  "IsFrequentlyForwarded",
  "is_frequently_forwarded",
] as const;

const JSON_BLOB_KEYS = [
  "ChannelMetadata",
  "channelMetadata",
  "WhatsappContext",
  "WhatsAppContext",
  "Context",
  "context",
] as const;

export const parseBooleanish = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return null;
};

const readTopLevel = (
  payload: Record<string, unknown>,
  keys: readonly string[],
): { value: boolean | null; key: string | null } => {
  for (const key of keys) {
    if (!(key in payload)) {
      continue;
    }
    const parsed = parseBooleanish(payload[key]);
    if (parsed !== null) {
      return { value: parsed, key };
    }
  }
  return { value: null, key: null };
};

const tryParseJsonObject = (raw: unknown): Record<string, unknown> | null => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
};

const readFromContextObject = (
  context: Record<string, unknown>,
): {
  isForwarded: boolean | null;
  isFrequentlyForwarded: boolean | null;
  keys: string[];
} => {
  const keys: string[] = [];
  const forwarded = parseBooleanish(
    context.forwarded ?? context.Forwarded ?? context.is_forwarded,
  );
  if (forwarded !== null) {
    keys.push("context.forwarded");
  }
  const frequently = parseBooleanish(
    context.frequently_forwarded ??
      context.FrequentlyForwarded ??
      context.is_frequently_forwarded,
  );
  if (frequently !== null) {
    keys.push("context.frequently_forwarded");
  }
  return {
    isForwarded: forwarded,
    isFrequentlyForwarded: frequently,
    keys,
  };
};

const readFromJsonBlobs = (
  payload: Record<string, unknown>,
): {
  isForwarded: boolean | null;
  isFrequentlyForwarded: boolean | null;
  keys: string[];
} => {
  let isForwarded: boolean | null = null;
  let isFrequentlyForwarded: boolean | null = null;
  const keys: string[] = [];

  for (const blobKey of JSON_BLOB_KEYS) {
    if (!(blobKey in payload)) {
      continue;
    }
    const obj = tryParseJsonObject(payload[blobKey]);
    if (!obj) {
      continue;
    }

    const contextCandidate =
      tryParseJsonObject(obj.context) ??
      tryParseJsonObject(obj.Context) ??
      (obj.forwarded !== undefined || obj.frequently_forwarded !== undefined ? obj : null);

    if (!contextCandidate) {
      continue;
    }

    const fromContext = readFromContextObject(contextCandidate);
    if (fromContext.isForwarded !== null) {
      isForwarded = fromContext.isForwarded;
      keys.push(`${blobKey}.${fromContext.keys.find((k) => k.includes("forwarded") && !k.includes("frequently")) ?? "forwarded"}`);
    }
    if (fromContext.isFrequentlyForwarded !== null) {
      isFrequentlyForwarded = fromContext.isFrequentlyForwarded;
      keys.push(
        `${blobKey}.${fromContext.keys.find((k) => k.includes("frequently")) ?? "frequently_forwarded"}`,
      );
    }
  }

  return { isForwarded, isFrequentlyForwarded, keys };
};

const coalesceBoolean = (primary: boolean | null, secondary: boolean | null): boolean | null => {
  if (primary === true || secondary === true) {
    return true;
  }
  if (primary === false || secondary === false) {
    return false;
  }
  return null;
};

const toForwardDetection = (
  isForwarded: boolean | null,
  isFrequentlyForwarded: boolean | null,
): ForwardDetectionStatus => {
  if (isForwarded === true || isFrequentlyForwarded === true) {
    return "FORWARDED";
  }
  if (isForwarded === false || isFrequentlyForwarded === false) {
    return "NOT_FORWARDED";
  }
  return "UNKNOWN";
};

/**
 * Extract location forward metadata from a Twilio webhook payload (incl. passthrough fields).
 * Missing signals → null / UNKNOWN (fail-open for attendance; never invents not-forwarded).
 */
export const extractLocationMessageMetadata = (
  payload: Record<string, unknown>,
): LocationMessageMetadata => {
  const sourceMessageSid =
    typeof payload.MessageSid === "string" && payload.MessageSid.trim()
      ? payload.MessageSid.trim()
      : typeof payload.messageSid === "string"
        ? payload.messageSid
        : "";

  const topForwarded = readTopLevel(payload, FORWARDED_KEYS);
  const topFrequent = readTopLevel(payload, FREQUENTLY_FORWARDED_KEYS);
  const fromBlobs = readFromJsonBlobs(payload);

  const signalKeysFound = [
    ...(topForwarded.key ? [topForwarded.key] : []),
    ...(topFrequent.key ? [topFrequent.key] : []),
    ...fromBlobs.keys,
  ];

  const isForwarded = coalesceBoolean(topForwarded.value, fromBlobs.isForwarded);
  const isFrequentlyForwarded = coalesceBoolean(
    topFrequent.value,
    fromBlobs.isFrequentlyForwarded,
  );

  return {
    isForwarded,
    isFrequentlyForwarded,
    sourceMessageSid,
    forwardDetection: toForwardDetection(isForwarded, isFrequentlyForwarded),
    signalKeysFound: [...new Set(signalKeysFound)],
  };
};

/** Explicit evidence that the location must not be used for physical attendance. */
export const isExplicitlyForwardedLocation = (metadata: LocationMessageMetadata): boolean =>
  metadata.forwardDetection === "FORWARDED";
