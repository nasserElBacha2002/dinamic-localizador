import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearPersistedPasswordResetToken,
  persistPasswordResetToken,
  readPersistedPasswordResetToken,
} from "./password-reset-token";

describe("password reset token session storage", () => {
  it("does not use the auth JWT storage key", () => {
    const storage = new Map<string, string>();
    const original = globalThis.sessionStorage;
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    try {
      persistPasswordResetToken("abcdefghijklmnopqrstuvwxyz0123456789abcd");
      assert.equal(storage.get("dinamic_password_reset_token_v1"), "abcdefghijklmnopqrstuvwxyz0123456789abcd");
      assert.equal(storage.has("dinamic_auth_token"), false);
      assert.equal(storage.get("dinamic_password_reset_token_v1")?.includes("expiresAt"), false);
      assert.ok(readPersistedPasswordResetToken());
      clearPersistedPasswordResetToken();
      assert.equal(readPersistedPasswordResetToken(), null);
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
