import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCheckInIntent,
  normalizeIntentText,
  parseInventorySelection,
} from "./intent";
import { normalizeWhatsAppPhone } from "./phone";

describe("normalizeIntentText", () => {
  it("normalizes accents and casing", () => {
    assert.equal(normalizeIntentText("  Llegué  "), "llegue");
    assert.equal(normalizeIntentText("CHECK-IN"), "check-in");
  });
});

describe("isCheckInIntent", () => {
  it("accepts supported intents", () => {
    assert.equal(isCheckInIntent("Llegué"), true);
    assert.equal(isCheckInIntent("llegue"), true);
    assert.equal(isCheckInIntent("registrar llegada"), true);
  });

  it("rejects unsupported text", () => {
    assert.equal(isCheckInIntent("hola equipo"), false);
  });
});

describe("parseInventorySelection", () => {
  it("parses valid numeric selection", () => {
    assert.equal(parseInventorySelection("2"), 2);
  });

  it("rejects invalid selection", () => {
    assert.equal(parseInventorySelection("abc"), null);
    assert.equal(parseInventorySelection("0"), null);
  });
});

describe("normalizeWhatsAppPhone", () => {
  it("strips whatsapp prefix", () => {
    assert.equal(normalizeWhatsAppPhone("whatsapp:+5491112345678"), "+5491112345678");
  });

  it("keeps normalized e164 number", () => {
    assert.equal(normalizeWhatsAppPhone("+5491112345678"), "+5491112345678");
  });
});
