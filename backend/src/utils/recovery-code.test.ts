import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "./recovery-code";

describe("recovery codes", () => {
  it("normalizes case and separators the same way", () => {
    const a = hashRecoveryCode("abcd-efgh-ijkl-mnop-qrst");
    const b = hashRecoveryCode("ABCD EFGH IJKL MNOP QRST");
    assert.equal(normalizeRecoveryCode("abcd-efgh"), "ABCDEFGH");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("generates unique formatted codes", () => {
    const codes = generateRecoveryCodes(10);
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) {
      assert.match(code, /^[A-F0-9]{4}(-[A-F0-9]{4}){4}$/);
    }
  });
});
