import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskPhoneNumberForLog } from "./phone";

describe("maskPhoneNumberForLog", () => {
  it("masks E.164 phone numbers for logs", () => {
    assert.equal(maskPhoneNumberForLog("+5491111111111"), "+54911******11");
  });

  it("masks whatsapp-prefixed numbers", () => {
    assert.equal(maskPhoneNumberForLog("whatsapp:+5491111111111"), "+54911******11");
  });
});
