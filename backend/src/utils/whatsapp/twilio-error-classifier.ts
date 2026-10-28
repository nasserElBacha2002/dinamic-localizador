/**
 * Typed Twilio / network error classification for outbound WhatsApp sends.
 * Prefer status/code over free-text matching. Do not treat "INVALID" as a catch-all.
 */

export type TwilioErrorClassification = {
  retryable: boolean;
  normalizedCode: string;
  retryAfterMs?: number;
};

type TwilioLikeError = {
  status?: number | string;
  code?: number | string;
  message?: string;
  moreInfo?: string;
  retryAfter?: number | string;
  headers?: Record<string, string | string[] | undefined>;
  cause?: unknown;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readRetryAfterMs = (error: TwilioLikeError): number | undefined => {
  const header =
    error.headers?.["retry-after"] ??
    error.headers?.["Retry-After"] ??
    error.retryAfter;
  const raw = Array.isArray(header) ? header[0] : header;
  const seconds = asNumber(raw);
  if (seconds !== null && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  return undefined;
};

const networkCodeFromMessage = (message: string): string | null => {
  const upper = message.toUpperCase();
  for (const code of ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]) {
    if (upper.includes(code)) {
      return code;
    }
  }
  if (upper.includes("TIMEOUT") || upper.includes("TIMED OUT")) {
    return "ETIMEDOUT";
  }
  return null;
};

const unwrap = (error: unknown): TwilioLikeError => {
  if (!error || typeof error !== "object") {
    return { message: String(error ?? "UNKNOWN") };
  }
  return error as TwilioLikeError;
};

/**
 * Classifies Twilio REST / network failures for retry decisions.
 */
export const classifyTwilioOutboundError = (error: unknown): TwilioErrorClassification => {
  const err = unwrap(error);
  const status = asNumber(err.status);
  const code = asNumber(err.code);
  const message = err.message ?? "";
  const retryAfterMs = readRetryAfterMs(err);

  // Permanent Twilio application codes
  if (code === 21211) {
    return { retryable: false, normalizedCode: "TWILIO_21211" };
  }
  if (code === 21610) {
    return { retryable: false, normalizedCode: "TWILIO_21610" };
  }

  // Explicit network errno on Node errors
  const errno =
    typeof (error as { code?: unknown })?.code === "string"
      ? String((error as { code: string }).code).toUpperCase()
      : networkCodeFromMessage(message);
  if (errno === "ECONNRESET" || errno === "ETIMEDOUT" || errno === "ECONNREFUSED" || errno === "EAI_AGAIN") {
    return { retryable: true, normalizedCode: errno, retryAfterMs };
  }
  if (errno === "ENOTFOUND") {
    return { retryable: true, normalizedCode: "ENOTFOUND", retryAfterMs };
  }

  if (status === 429) {
    return { retryable: true, normalizedCode: "HTTP_429", retryAfterMs };
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { retryable: true, normalizedCode: `HTTP_${status}`, retryAfterMs };
  }
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return { retryable: false, normalizedCode: `HTTP_${status}` };
  }

  // Config / validation thrown by our outbound wrapper (not free-text INVALID)
  if (message === "TWILIO_CREDENTIALS_NOT_CONFIGURED") {
    return { retryable: false, normalizedCode: "TWILIO_CREDENTIALS_NOT_CONFIGURED" };
  }
  if (message === "TWILIO_WHATSAPP_NUMBER_NOT_CONFIGURED") {
    return { retryable: false, normalizedCode: "TWILIO_WHATSAPP_NUMBER_NOT_CONFIGURED" };
  }

  // Ambiguous / unknown → retryable once (at-least-once), but caller may treat timeout specially
  if (status === null && code === null && networkCodeFromMessage(message) === "ETIMEDOUT") {
    return { retryable: true, normalizedCode: "ETIMEDOUT", retryAfterMs };
  }

  return {
    retryable: true,
    normalizedCode: code !== null ? `TWILIO_${code}` : status !== null ? `HTTP_${status}` : "UNKNOWN",
    retryAfterMs,
  };
};

/**
 * True when the failure may mean Twilio accepted the message but we never saw the SID
 * (timeout / connection reset mid-flight). Caller must NOT auto-resend.
 */
export const isAmbiguousTwilioSendFailure = (classification: TwilioErrorClassification): boolean =>
  classification.normalizedCode === "ETIMEDOUT" ||
  classification.normalizedCode === "ECONNRESET" ||
  classification.normalizedCode === "UNKNOWN";
