import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSensitiveAuditKey,
  normalizeAuditKey,
  sanitizeAuditPayload,
} from "./audit-sanitize";

describe("sanitizeAuditPayload", () => {
  it("normalizes keys by lowercasing and stripping _ / -", () => {
    assert.equal(normalizeAuditKey("access_Token"), "accesstoken");
    assert.equal(normalizeAuditKey("client-Secret"), "clientsecret");
    assert.equal(isSensitiveAuditKey("tokenCount"), false);
    assert.equal(isSensitiveAuditKey("token"), true);
  });

  it("redacts nested objects, arrays, and real secret name variants", () => {
    const sanitized = sanitizeAuditPayload({
      role: "ADMIN",
      status: "ACTIVE",
      tokenCount: 3,
      password: "secret",
      password_hash: "hash",
      accessToken: "a",
      refresh_token: "r",
      clientSecret: "cs",
      providerApiKey: "pk",
      twilioAuthToken: "tw",
      signedUrl: "https://example/signed",
      nested: {
        invitationToken: "inv",
        items: [{ privateKey: "pk", role: "OPERATOR" }],
      },
    });

    assert.deepEqual(sanitized, {
      role: "ADMIN",
      status: "ACTIVE",
      tokenCount: 3,
      password: "[REDACTED]",
      password_hash: "[REDACTED]",
      accessToken: "[REDACTED]",
      refresh_token: "[REDACTED]",
      clientSecret: "[REDACTED]",
      providerApiKey: "[REDACTED]",
      twilioAuthToken: "[REDACTED]",
      signedUrl: "[REDACTED]",
      nested: {
        invitationToken: "[REDACTED]",
        items: [{ privateKey: "[REDACTED]", role: "OPERATOR" }],
      },
    });
  });

  it("returns null for nullish input", () => {
    assert.equal(sanitizeAuditPayload(null), null);
    assert.equal(sanitizeAuditPayload(undefined), null);
  });
});
