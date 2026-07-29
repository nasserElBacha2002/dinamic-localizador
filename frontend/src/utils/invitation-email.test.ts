import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearPersistedInvitationToken,
  emailMatchesMasked,
  isSafeInternalPath,
  persistInvitationToken,
  readPersistedInvitationToken,
} from "./invitation-email";

describe("emailMatchesMasked", () => {
  it("matches invitation email against masked preview", () => {
    assert.equal(emailMatchesMasked("ana@example.com", "an***@example.com"), true);
    assert.equal(emailMatchesMasked("a@example.com", "a***@example.com"), true);
    assert.equal(emailMatchesMasked("other@example.com", "an***@example.com"), false);
    assert.equal(emailMatchesMasked("ana@example.com", "an***@other.com"), false);
  });
});

describe("isSafeInternalPath", () => {
  it("accepts internal paths only", () => {
    assert.equal(isSafeInternalPath("/invitations/accept"), true);
    assert.equal(isSafeInternalPath("//evil.com"), false);
    assert.equal(isSafeInternalPath("https://evil.com"), false);
    assert.equal(isSafeInternalPath(null), false);
  });
});

describe("invitation token session storage", () => {
  it("persists with TTL and clears", () => {
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
      persistInvitationToken("abcdefghijklmnopqrstuvwxyz0123456789abcd");
      assert.ok((readPersistedInvitationToken()?.length ?? 0) > 20);
      clearPersistedInvitationToken();
      assert.equal(readPersistedInvitationToken(), null);
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
