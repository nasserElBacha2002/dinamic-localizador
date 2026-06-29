import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatWhatsAppAddress } from "./whatsapp-phone";

describe("formatWhatsAppAddress", () => {
  it("formats numbers with plus", () => {
    assert.equal(formatWhatsAppAddress("+5491139526563"), "whatsapp:+5491139526563");
  });

  it("formats numbers without plus", () => {
    assert.equal(formatWhatsAppAddress("5491139526563"), "whatsapp:+5491139526563");
  });

  it("formats numbers with whatsapp prefix and plus", () => {
    assert.equal(
      formatWhatsAppAddress("whatsapp:+5491139526563"),
      "whatsapp:+5491139526563",
    );
  });

  it("formats numbers with whatsapp prefix and without plus", () => {
    assert.equal(
      formatWhatsAppAddress("whatsapp:5491139526563"),
      "whatsapp:+5491139526563",
    );
  });

  it("rejects empty numbers", () => {
    assert.throws(() => formatWhatsAppAddress(""), /INVALID_WHATSAPP_PHONE_NUMBER/);
    assert.throws(() => formatWhatsAppAddress("whatsapp:"), /INVALID_WHATSAPP_PHONE_NUMBER/);
  });

  it("rejects invalid numbers", () => {
    assert.throws(() => formatWhatsAppAddress("abc"), /INVALID_WHATSAPP_PHONE_NUMBER/);
    assert.throws(() => formatWhatsAppAddress("+12"), /INVALID_WHATSAPP_PHONE_NUMBER/);
  });
});
