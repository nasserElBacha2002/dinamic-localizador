import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decryptPhoneForObservability,
  encryptPhoneForObservability,
} from "./whatsapp-observability-phone-crypto";

describe("whatsapp observability phone crypto", () => {
  it("round-trips encrypted phones", () => {
    const secret = "test-secret-at-least-16";
    const encrypted = encryptPhoneForObservability("+5491112345678", secret);
    assert.ok(encrypted.startsWith("v1:"));
    assert.equal(decryptPhoneForObservability(encrypted, secret), "+5491112345678");
  });

  it("supports legacy plaintext values", () => {
    assert.equal(
      decryptPhoneForObservability("+5491112345678", "test-secret-at-least-16"),
      "+5491112345678",
    );
  });
});
