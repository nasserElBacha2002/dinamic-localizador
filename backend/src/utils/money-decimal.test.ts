import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absDecimalString, isDecimalString, normalizeDecimalString } from "./money-decimal";

describe("money-decimal", () => {
  it("normalizes provider decimal strings without float drift", () => {
    assert.equal(normalizeDecimalString("-0.005000"), "-0.005");
    assert.equal(normalizeDecimalString("1.2300"), "1.23");
    assert.equal(normalizeDecimalString(null), null);
    assert.equal(isDecimalString("12.34"), true);
    assert.equal(isDecimalString("12.34.5"), false);
  });

  it("takes absolute value for Twilio negative charges", () => {
    assert.equal(absDecimalString("-0.005"), "0.005");
    assert.equal(absDecimalString("0.01"), "0.01");
  });
});
