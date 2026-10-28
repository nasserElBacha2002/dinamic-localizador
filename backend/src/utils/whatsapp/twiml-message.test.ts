import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractMessageFromTwiml } from "./twiml-message";

describe("extractMessageFromTwiml", () => {
  it("extracts text from a TwiML message body", () => {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Hola &amp; bienvenido</Message></Response>`;
    assert.equal(extractMessageFromTwiml(twiml), "Hola & bienvenido");
  });

  it("returns trimmed raw twiml when no message tag exists", () => {
    const twiml = "  <Response></Response>  ";
    assert.equal(extractMessageFromTwiml(twiml), "<Response></Response>");
  });
});
