import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

/** Opaque invitation token (URL-safe). Never persist this value. */
export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Redacts invitation tokens from strings intended for logs. */
export function redactInvitationSecrets(value: string): string {
  return value
    .replace(/([?&]token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[REDACTED_TOKEN]");
}
