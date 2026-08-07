import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeAuditPayload } from "./audit-sanitize";

describe("sanitizeAuditPayload", () => {
  it("redacts known credential keys and keeps safe fields", () => {
    const sanitized = sanitizeAuditPayload({
      role: "ADMIN",
      password: "secret",
      passwordHash: "hash",
      token: "abc",
      accessToken: "a",
      refreshToken: "r",
      nested: { invitationToken: "inv", status: "ACTIVE" },
    });

    assert.deepEqual(sanitized, {
      role: "ADMIN",
      password: "[REDACTED]",
      passwordHash: "[REDACTED]",
      token: "[REDACTED]",
      accessToken: "[REDACTED]",
      refreshToken: "[REDACTED]",
      nested: { invitationToken: "[REDACTED]", status: "ACTIVE" },
    });
  });

  it("returns null for nullish input", () => {
    assert.equal(sanitizeAuditPayload(null), null);
    assert.equal(sanitizeAuditPayload(undefined), null);
  });
});
