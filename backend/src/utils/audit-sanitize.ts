const SENSITIVE_KEY_PATTERN =
  /^(password|passwordhash|password_hash|token|accesstoken|access_token|refreshtoken|refresh_token|invitationtoken|invitation_token|resettoken|reset_token|secret|apikey|api_key|authorization|authheader|signedurl|signed_url|contentsid|content_sid|privatekey|private_key)$/i;

const redactValue = (): string => "[REDACTED]";

/**
 * Shallow/recursive redaction of known secret keys before persisting audit JSON.
 * Does not invent a full PII framework — only strips credential-like fields.
 */
export const sanitizeAuditPayload = (
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null => {
  if (value == null) {
    return null;
  }
  return sanitizeUnknown(value) as Record<string, unknown>;
};

const sanitizeUnknown = (value: unknown): unknown => {
  if (value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }
  if (typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = redactValue();
      continue;
    }
    output[key] = sanitizeUnknown(nested);
  }
  return output;
};
