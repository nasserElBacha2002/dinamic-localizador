import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { twilioWebhookSchema } from "./twilio-webhook.schema";

describe("twilioWebhookSchema replacement quick reply context", () => {
  it("keeps the outbound message SID that Twilio supplies for a quick reply", () => {
    const payload = twilioWebhookSchema.parse({
      MessageSid: "SM_INBOUND_REPLY",
      From: "whatsapp:+5491100000001",
      To: "whatsapp:+5491100000002",
      ButtonPayload: "replacement_option_2",
      OriginalRepliedMessageSid: "SM_OUTBOUND_REPLACEMENT_A",
    });

    assert.equal(payload.ButtonPayload, "replacement_option_2");
    assert.equal(payload.OriginalRepliedMessageSid, "SM_OUTBOUND_REPLACEMENT_A");
  });
});

