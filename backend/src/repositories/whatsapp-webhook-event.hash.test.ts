import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashWebhookPayload } from "../repositories/whatsapp-webhook-event.repository";

describe("hashWebhookPayload", () => {
  it("changes when media URL differs with same NumMedia", () => {
    const base = {
      MessageSid: "SM1",
      From: "whatsapp:+1",
      To: "whatsapp:+2",
      Body: null,
      NumMedia: "1",
      MediaUrl0: "https://example.com/a.jpg",
      MediaContentType0: "image/jpeg",
    };
    const other = {
      ...base,
      MediaUrl0: "https://example.com/b.jpg",
    };
    assert.notEqual(hashWebhookPayload(base), hashWebhookPayload(other));
  });

  it("is stable regardless of object key insertion order", () => {
    const a = hashWebhookPayload({
      Body: "hola",
      MessageSid: "SM1",
      From: "a",
      To: "b",
    });
    const b = hashWebhookPayload({
      To: "b",
      From: "a",
      MessageSid: "SM1",
      Body: "hola",
    });
    assert.equal(a, b);
  });
});
