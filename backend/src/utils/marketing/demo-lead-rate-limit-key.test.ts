import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marketingDemoEmailRateLimitKey } from "./demo-lead-rate-limit-key";

describe("marketingDemoEmailRateLimitKey", () => {
  it("does not embed the plaintext email address", () => {
    const email = "sensitive.lead@example.com";
    const key = marketingDemoEmailRateLimitKey(email);
    assert.doesNotMatch(key, /@/);
    assert.doesNotMatch(key, new RegExp(email.replace(".", "\\."), "i"));
    assert.match(key, /^marketing-demo-email:[a-f0-9]+$/);
  });

  it("normalizes case before hashing", () => {
    const a = marketingDemoEmailRateLimitKey("Lead@Example.com");
    const b = marketingDemoEmailRateLimitKey("lead@example.com");
    assert.equal(a, b);
  });
});