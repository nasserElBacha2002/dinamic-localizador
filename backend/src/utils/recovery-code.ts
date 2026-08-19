import { randomBytes } from "node:crypto";
import { hashOpaqueToken } from "./opaque-token";

export const RECOVERY_CODE_COUNT = 10;

/** Strips separators and uppercases. `abcd-efgh` and `ABCD EFGH` hash the same. */
export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function formatRecoveryCode(normalized: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < normalized.length; i += 4) {
    chunks.push(normalized.slice(i, i + 4));
  }
  return chunks.join("-");
}

/** 10 CSPRNG bytes → 20 hex chars (80 bits), displayed as XXXX-XXXX-XXXX-XXXX-XXXX. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const normalized = randomBytes(10).toString("hex").toUpperCase();
    codes.push(formatRecoveryCode(normalized));
  }
  return codes;
}

export function hashRecoveryCode(raw: string): string {
  return hashOpaqueToken(normalizeRecoveryCode(raw));
}
