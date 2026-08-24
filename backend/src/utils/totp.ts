import { Secret, TOTP } from "otpauth";
import { env } from "../config/env";

/** RFC 6238 defaults used by Google Authenticator and compatible apps. */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_ALGORITHM = "SHA1";
export const TOTP_WINDOW = 1;

export function createTotpSecret(): { base32: string } {
  const secret = new Secret({ size: 20 });
  return { base32: secret.base32 };
}

function totpForAccount(base32Secret: string, accountEmail: string): TOTP {
  return new TOTP({
    issuer: env.TWO_FACTOR_ISSUER,
    label: accountEmail,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(base32Secret),
  });
}

export function buildTotpUri(base32Secret: string, accountEmail: string): string {
  return totpForAccount(base32Secret, accountEmail).toString();
}

export function generateTotpCode(base32Secret: string, accountEmail: string, timestamp = Date.now()): string {
  return totpForAccount(base32Secret, accountEmail).generate({ timestamp });
}

export function currentTotpStep(timestamp = Date.now()): number {
  return TOTP.counter({ period: TOTP_PERIOD_SECONDS, timestamp });
}

/**
 * Validates a TOTP within ±TOTP_WINDOW steps.
 * Returns the absolute step that matched, or null.
 */
export function verifyTotpCode(
  base32Secret: string,
  accountEmail: string,
  code: string,
  timestamp = Date.now(),
): number | null {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    return null;
  }
  const totp = totpForAccount(base32Secret, accountEmail);
  const delta = totp.validate({ token: normalized, window: TOTP_WINDOW, timestamp });
  if (delta === null) {
    return null;
  }
  return currentTotpStep(timestamp) + delta;
}
