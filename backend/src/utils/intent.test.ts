import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCheckInIntent,
  isCheckoutIntent,
  isGlobalBackCommand,
  isGlobalCancelCommand,
  isGlobalHelpCommand,
  isGlobalMenuCommand,
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

describe("isCheckoutIntent", () => {
  it("accepts supported checkout intents", () => {
    assert.equal(isCheckoutIntent("Me voy"), true);
    assert.equal(isCheckoutIntent("Terminé"), true);
    assert.equal(isCheckoutIntent("Finalicé"), true);
    assert.equal(isCheckoutIntent("finalice"), true);
    assert.equal(isCheckoutIntent("salida"), true);
  });

  it("rejects check-in intents and global cancel commands", () => {
    assert.equal(isCheckoutIntent("Llegué"), false);
    assert.equal(isCheckoutIntent("salir"), false);
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

describe("isGlobalMenuCommand", () => {
  it("accepts menu commands", () => {
    assert.equal(isGlobalMenuCommand("menu"), true);
    assert.equal(isGlobalMenuCommand("menú"), true);
    assert.equal(isGlobalMenuCommand("inicio"), true);
  });

  it("rejects help and unrelated text", () => {
    assert.equal(isGlobalMenuCommand("ayuda"), false);
    assert.equal(isGlobalMenuCommand("help"), false);
    assert.equal(isGlobalMenuCommand("Llegué"), false);
    assert.equal(isGlobalMenuCommand("hola"), false);
  });
});

describe("isGlobalHelpCommand", () => {
  it("accepts help commands", () => {
    assert.equal(isGlobalHelpCommand("ayuda"), true);
    assert.equal(isGlobalHelpCommand("help"), true);
  });

  it("rejects unrelated text", () => {
    assert.equal(isGlobalHelpCommand("menu"), false);
    assert.equal(isGlobalHelpCommand("Llegué"), false);
  });
});

describe("isGlobalCancelCommand", () => {
  it("accepts cancel commands", () => {
    assert.equal(isGlobalCancelCommand("cancelar"), true);
    assert.equal(isGlobalCancelCommand("Cancelar"), true);
    assert.equal(isGlobalCancelCommand("salir"), true);
  });

  it("rejects unrelated text", () => {
    assert.equal(isGlobalCancelCommand("Me voy"), false);
  });
});

describe("isGlobalBackCommand", () => {
  it("accepts volver command", () => {
    assert.equal(isGlobalBackCommand("volver"), true);
  });

  it("rejects unrelated text", () => {
    assert.equal(isGlobalBackCommand("cancelar"), false);
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
