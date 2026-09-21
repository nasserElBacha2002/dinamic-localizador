import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  twilioWebhookPayloadToStringRecord,
  twilioWebhookPayloadToUnknownRecord,
} from "./twilio-webhook-payload";

describe("twilioWebhookPayloadToStringRecord", () => {
  it("copies string fields and drops non-strings", () => {
    const record = twilioWebhookPayloadToStringRecord({
      MessageSid: "SM1",
      From: "+54911",
      To: "+54910",
      Body: "hola",
      NumMedia: "0",
    });
    assert.equal(record.MessageSid, "SM1");
    assert.equal(record.Body, "hola");
    assert.equal(Object.keys(record).includes("From"), true);
  });

  it("preserves Media* keys when present as strings on the object", () => {
    const payload = {
      MessageSid: "SM2",
      From: "+1",
      To: "+2",
      MediaUrl0: "https://example.com/a.jpg",
    };
    const record = twilioWebhookPayloadToStringRecord(payload);
    assert.equal(record.MediaUrl0, "https://example.com/a.jpg");
    const unknown = twilioWebhookPayloadToUnknownRecord(payload);
    assert.equal(unknown.MediaUrl0, "https://example.com/a.jpg");
  });
});
