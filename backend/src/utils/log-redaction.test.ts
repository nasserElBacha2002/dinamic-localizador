import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  logLineContainsRawSecret,
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
});
