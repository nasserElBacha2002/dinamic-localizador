const REDACTED = "[REDACTED]";

/**
 * Normalized exact-match secret key families (defense in depth).
 * Critical callers must still send minimal allowlisted diffs; this only strips
 * credential-like keys that slip through.
 *
 * Normalization: lowercase + remove `_` and `-`.
 * Exact match only — e.g. `tokenCount` → `tokencount` is NOT redacted.
 */
const SENSITIVE_KEY_FAMILIES = new Set([
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "invitationtoken",
  "resettoken",
  "secret",
  "clientsecret",
  "apikey",
  "providerapikey",
  "authorization",
  "authheader",
  "authtoken",
  "twilioauthtoken",
  "signedurl",
  "contentsid",
  "privatekey",
]);

export const normalizeAuditKey = (key: string): string =>
  key.toLowerCase().replace(/[_-]/g, "");

export const isSensitiveAuditKey = (key: string): boolean =>
  SENSITIVE_KEY_FAMILIES.has(normalizeAuditKey(key));

/**
 * Recursive redaction of known credential-like keys before persisting audit JSON.
 * Secondary defense only — prefer minimal allowlisted payloads at call sites.
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
    if (isSensitiveAuditKey(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = sanitizeUnknown(nested);
  }
  return output;
};
