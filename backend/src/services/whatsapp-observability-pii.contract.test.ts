import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { WhatsAppMessage } from "../types/twilio.types";

describe("whatsapp observability listMessages PII contract", () => {
  it("never returns full E.164 phones in listMessages JSON", async () => {
    mock.reset();
    const fullFrom = "+5491112345678";
    const fullTo = "+5491199999999";

    const message: WhatsAppMessage = {
      id: "11111111-1111-1111-1111-111111111111",
      companyId: "33333333-3333-3333-3333-333333333333",
      messageSid: "SM123",
      direction: "INBOUND",
      employeeId: null,
      phoneFrom: fullFrom,
      phoneTo: fullTo,
      messageType: "TEXT",
      body: "hola",
      latitude: -34.6,
      longitude: -58.4,
      status: "RECEIVED",
      rawPayload: '{"AccountSid":"AC"}',
      processingStatus: "RECEIVED",
      processingErrorCode: null,
      processedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const { whatsappObservabilityRepository } = await import(
      "../repositories/whatsapp-observability.repository"
    );
    mock.method(whatsappObservabilityRepository, "listMessages", async () => ({
      data: [message],
      hasMore: false,
      nextCursor: null,
    }));
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => ({
      id: "22222222-2222-2222-2222-222222222222",
      companyId: "33333333-3333-3333-3333-333333333333",
    }));

    const { whatsappObservabilityService } = await import(
      "../services/whatsapp-observability.service"
    );

    const result = await whatsappObservabilityService.listMessages(
      "22222222-2222-2222-2222-222222222222",
      { limit: 20 },
    );

    const json = JSON.stringify(result);
    assert.equal(json.includes(fullFrom), false);
    assert.equal(json.includes(fullTo), false);
    assert.equal(result.data[0]?.phoneFrom.includes("******"), true);
    assert.equal(result.data[0]?.latitude, null);
    assert.equal(result.data[0]?.rawPayload, undefined);
  });
});
