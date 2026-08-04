import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WHATSAPP_MESSAGES_DEFAULT_LIMIT,
  WHATSAPP_MESSAGES_MAX_LIMIT,
  normalizeWhatsappMessagesLimit,
} from "./whatsapp-observability";

describe("whatsapp observability message limit contract", () => {
  it("keeps default within backend max", () => {
    assert.ok(WHATSAPP_MESSAGES_DEFAULT_LIMIT <= WHATSAPP_MESSAGES_MAX_LIMIT);
    assert.equal(WHATSAPP_MESSAGES_MAX_LIMIT, 100);
    assert.equal(WHATSAPP_MESSAGES_DEFAULT_LIMIT, 50);
  });

  it("normalizes edge values", () => {
    assert.equal(normalizeWhatsappMessagesLimit(undefined), 50);
    assert.equal(normalizeWhatsappMessagesLimit(Number.NaN), 50);
    assert.equal(normalizeWhatsappMessagesLimit(Number.POSITIVE_INFINITY), 50);
    assert.equal(normalizeWhatsappMessagesLimit(50.8), 50);
    assert.equal(normalizeWhatsappMessagesLimit(0), 1);
    assert.equal(normalizeWhatsappMessagesLimit(-20), 1);
    assert.equal(normalizeWhatsappMessagesLimit(1), 1);
    assert.equal(normalizeWhatsappMessagesLimit(100), 100);
    assert.equal(normalizeWhatsappMessagesLimit(101), 100);
    assert.equal(normalizeWhatsappMessagesLimit(500), 100);
  });
});
