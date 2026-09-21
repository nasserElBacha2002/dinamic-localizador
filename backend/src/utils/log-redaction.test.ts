import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  logLineContainsRawSecret,
  maskPhoneForLogs,
  sanitizeHeadersForLogs,
  sanitizeObjectForLogs,
  sanitizeUrlForLogs,
} from "./log-redaction";

describe("log-redaction", () => {
  it("redacts invitation token query params", () => {
    const secret = "a".repeat(40);
    const sanitized = sanitizeUrlForLogs(`/api/invitations/preview?token=${secret}&x=1`);
    assert.equal(logLineContainsRawSecret(sanitized, secret), false);
    assert.match(sanitized, /token=%5BREDACTED%5D|token=\[REDACTED\]/);
    assert.match(sanitized, /x=1/);
  });

  it("redacts tokens in absolute URLs", () => {
    const secret = "invitetokenvalue0123456789abcdef";
    const sanitized = sanitizeUrlForLogs(
      `https://app.example/invitations/accept?token=${secret}`,
    );
    assert.equal(logLineContainsRawSecret(sanitized, secret), false);
  });

  it("preserves normal non-secret query params", () => {
    const sanitized = sanitizeUrlForLogs(
      "/api/operations?page=2&companyId=11111111-1111-1111-1111-111111111111",
    );
    assert.match(sanitized, /page=2/);
    assert.match(sanitized, /companyId=11111111-1111-1111-1111-111111111111/);
  });

  it("redacts Authorization and Cookie headers", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
    const cookie = "session=abc123secretvalue; Path=/";
    const sanitized = sanitizeHeadersForLogs({
      Authorization: `Bearer ${jwt}`,
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Request-Id": "req-1",
    });
    assert.equal(sanitized.Authorization, "[REDACTED]");
    assert.equal(sanitized.Cookie, "[REDACTED]");
    assert.equal(sanitized["Content-Type"], "application/json");
    assert.equal(sanitized["X-Request-Id"], "req-1");
    assert.equal(logLineContainsRawSecret(JSON.stringify(sanitized), jwt), false);
    assert.equal(logLineContainsRawSecret(JSON.stringify(sanitized), "abc123secretvalue"), false);
  });

  it("redacts password and token keys in body objects", () => {
    const secret = "SuperSecretPassword99";
    const token = "refresh-token-value-abcdef12";
    const sanitized = sanitizeObjectForLogs({
      email: "user@example.com",
      password: secret,
      refreshToken: token,
      companyId: "c1",
    }) as Record<string, unknown>;

    assert.equal(sanitized.password, "[REDACTED]");
    assert.equal(sanitized.refreshToken, "[REDACTED]");
    assert.equal(sanitized.email, "user@example.com");
    assert.equal(sanitized.companyId, "c1");
    assert.equal(logLineContainsRawSecret(JSON.stringify(sanitized), secret), false);
    assert.equal(logLineContainsRawSecret(JSON.stringify(sanitized), token), false);
  });

  it("masks phone fields where applicable", () => {
    const phone = "+5491112345678";
    const sanitized = sanitizeObjectForLogs({
      phoneNumber: phone,
      employeeId: "e1",
    }) as Record<string, unknown>;
    assert.equal(typeof sanitized.phoneNumber, "string");
    assert.notEqual(sanitized.phoneNumber, phone);
    assert.equal(logLineContainsRawSecret(String(sanitized.phoneNumber), "12345678"), false);
    assert.match(maskPhoneForLogs(phone), /^\+54911\*{6}\d{2}$/);
  });
});
