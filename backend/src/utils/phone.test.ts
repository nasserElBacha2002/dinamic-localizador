import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  maskPhoneNumberForLog,
  normalizePhoneNumber,
  normalizeWhatsAppPhone,
  tryNormalizeWhatsAppPhone,
} from "./phone";

describe("phone normalization", () => {
  it("normalizes a valid E.164 phone", () => {
    assert.equal(normalizePhoneNumber("+5491111111111"), "+5491111111111");
  });

  it("normalizes whatsapp-prefixed input", () => {
    assert.equal(normalizeWhatsAppPhone("whatsapp:+5491111111111"), "+5491111111111");
  });

  it("rejects invalid phones via tryNormalizeWhatsAppPhone", () => {
    assert.equal(tryNormalizeWhatsAppPhone("not-a-phone"), null);
    assert.equal(tryNormalizeWhatsAppPhone(""), null);
    assert.equal(tryNormalizeWhatsAppPhone("whatsapp:123"), null);
  });

  it("throws on invalid normalizePhoneNumber input", () => {
    assert.throws(() => normalizePhoneNumber("5491111111111"), /INVALID_PHONE_FORMAT/);
    assert.throws(() => normalizePhoneNumber("+12"), /INVALID_PHONE_FORMAT/);
  });
});

describe("maskPhoneNumberForLog", () => {
  it("masks valid E.164 phone numbers for logs", () => {
    assert.equal(maskPhoneNumberForLog("+5491111111111"), "+54911******11");
  });

  it("masks whatsapp-prefixed numbers", () => {
    assert.equal(maskPhoneNumberForLog("whatsapp:+5491111111111"), "+54911******11");
  });

  it("masks invalid input without throwing", () => {
    assert.equal(maskPhoneNumberForLog("abc"), "***");
    assert.equal(maskPhoneNumberForLog("123456789012"), "123456******12");
  });

  it("masks short input as ***", () => {
    assert.equal(maskPhoneNumberForLog("12345678"), "***");
  });
});
