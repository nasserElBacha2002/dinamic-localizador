import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

/** Opaque URL-safe token. Never persist this value — store only the SHA-256 hash. */
export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Redacts invitation/reset tokens from strings intended for logs. */
export function redactOpaqueSecrets(value: string): string {
  return value
    .replace(/([?&]token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[REDACTED_TOKEN]");
}
