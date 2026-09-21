import { maskPhoneNumberForLog } from "./phone";

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "invitationtoken",
  "invitation_token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "password",
  "secret",
  "code",
  "authorization",
  "auth",
  "apikey",
  "api_key",
  "verification_code",
  "verificationcode",
]);

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

/** Body / metadata keys that must never appear raw in application logs. */
const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "invitationtoken",
  "invitation_token",
  "authorization",
  "cookie",
  "secret",
  "clientsecret",
  "apikey",
  "api_key",
  "authtoken",
  "auth_token",
  "verificationcode",
  "verification_code",
  "totp",
  "otp",
]);

const REDACTED = "[REDACTED]";

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[_-]/g, "");

export function sanitizeUrlForLogs(rawUrl: string): string {
  try {
    // Support path+query without origin (Express req.originalUrl).
    const hasOrigin = /^https?:\/\//i.test(rawUrl);
    const url = hasOrigin
      ? new URL(rawUrl)
      : new URL(rawUrl, "http://log.invalid");

    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, REDACTED);
      }
    }

    if (hasOrigin) {
      return url.toString();
    }

    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  } catch {
    return rawUrl.replace(
      /([?&](?:token|password|secret|code|access_token|refresh_token|authorization|verification_code)=)([^&]*)/gi,
      `$1${REDACTED}`,
    );
  }
}

export function sanitizeHeaderValueForLogs(name: string, value: string): string {
  if (SENSITIVE_HEADER_KEYS.has(name.toLowerCase())) {
    return REDACTED;
  }
  return value;
}

export function sanitizeHeadersForLogs(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    const joined = Array.isArray(value) ? value.join(", ") : value;
    out[key] = sanitizeHeaderValueForLogs(key, joined);
  }
  return out;
}

export function isSensitiveLogKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_QUERY_KEYS.has(lower) || SENSITIVE_BODY_KEYS.has(lower)) {
    return true;
  }
  return SENSITIVE_BODY_KEYS.has(normalizeKey(key));
}

/**
 * Deep-sanitize objects before logging (headers/body dumps, debug metadata).
 * Preserves operationally useful identifiers; redacts secret material.
 */
export function sanitizeObjectForLogs(
  value: unknown,
  options: { maxDepth?: number } = {},
): unknown {
  const maxDepth = options.maxDepth ?? 4;

  const walk = (node: unknown, depth: number): unknown => {
    if (node == null || typeof node === "number" || typeof node === "boolean") {
      return node;
    }
    if (typeof node === "string") {
      return node;
    }
    if (depth >= maxDepth) {
      return "[truncated]";
    }
    if (Array.isArray(node)) {
      return node.map((item) => walk(item, depth + 1));
    }
    if (typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (isSensitiveLogKey(key)) {
          out[key] = REDACTED;
          continue;
        }
        if (/phone/i.test(key) && typeof child === "string") {
          out[key] = maskPhoneNumberForLog(child);
          continue;
        }
        out[key] = walk(child, depth + 1);
      }
      return out;
    }
    return String(node);
  };

  return walk(value, 0);
}

/** Phone masking for ad-hoc security/ops logs (reuses phone util). */
export function maskPhoneForLogs(phoneNumber: string): string {
  return maskPhoneNumberForLog(phoneNumber);
}

/** True when raw secret material still appears in a log line (for tests). */
export function logLineContainsRawSecret(line: string, secret: string): boolean {
  if (!secret || secret.length < 8) {
    return false;
  }
  return line.includes(secret);
}
