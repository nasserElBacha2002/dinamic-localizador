import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import {
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW,
  buildTotpUri,
  createTotpSecret,
  generateTotpCode,
  verifyTotpCode,
} from "./totp";

describe("totp wrapper", () => {
  it("builds an otpauth URI with issuer and account", () => {
    const { base32 } = createTotpSecret();
    const uri = buildTotpUri(base32, "ops@example.com");
    assert.match(uri, /^otpauth:\/\/totp\//);
    assert.match(uri, /Dinamic%20Attendance/);
    assert.match(uri, /ops%40example.com/);
    assert.match(uri, /algorithm=SHA1/);
    assert.match(uri, /digits=6/);
    assert.match(uri, /period=30/);
  });

  it("accepts a current TOTP and rejects a wrong code", () => {
    const { base32 } = createTotpSecret();
    const now = Date.now();
    const code = generateTotpCode(base32, "ops@example.com", now);
    assert.equal(code.length, TOTP_DIGITS);
    assert.ok(verifyTotpCode(base32, "ops@example.com", code, now) !== null);
    assert.equal(verifyTotpCode(base32, "ops@example.com", "000000", now), null);
  });

  it("rejects a code outside the configured window", () => {
    const { base32 } = createTotpSecret();
    const now = Date.now();
    const far = now - (TOTP_WINDOW + 2) * TOTP_PERIOD_SECONDS * 1000;
    const oldCode = generateTotpCode(base32, "ops@example.com", far);
    assert.equal(verifyTotpCode(base32, "ops@example.com", oldCode, now), null);
  });
});
