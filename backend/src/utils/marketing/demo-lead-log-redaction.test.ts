import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSmtpErrorSnippet } from "./demo-lead-log-redaction";

describe("redactSmtpErrorSnippet", () => {
  it("redacts SMTP passwords and email addresses", () => {
    const raw =
      "535 Auth failed password=SuperSecret123 for user lead@prospect.com at smtp.hostinger.com";
    const redacted = redactSmtpErrorSnippet(raw);
    assert.doesNotMatch(redacted, /SuperSecret123/);
    assert.doesNotMatch(redacted, /lead@prospect\.com/);
    assert.match(redacted, /password=\[REDACTED\]/);
    assert.match(redacted, /\[REDACTED_EMAIL\]/);
  });

  it("truncates long transport messages", () => {
    const long = "x".repeat(200);
    assert.equal(redactSmtpErrorSnippet(long).length, 120);
  });
});