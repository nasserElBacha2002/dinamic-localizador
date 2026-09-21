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
]);

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
]);

const REDACTED = "[REDACTED]";

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
      /([?&](?:token|password|secret|code|access_token|refresh_token|authorization)=)([^&]*)/gi,
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

/** True when raw secret material still appears in a log line (for tests). */
export function logLineContainsRawSecret(line: string, secret: string): boolean {
  if (!secret || secret.length < 8) {
    return false;
  }
  return line.includes(secret);
}
