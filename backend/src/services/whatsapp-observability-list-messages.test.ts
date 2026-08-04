import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { WhatsAppMessage } from "../types/twilio.types";

function buildMessage(index: number, createdAt: string): WhatsAppMessage {
  const id = `${String(index).padStart(8, "0")}-1111-1111-1111-111111111111`;
  return {
    id,
    messageSid: `SM${index}`,
    direction: index % 2 === 0 ? "INBOUND" : "OUTBOUND",
    employeeId: null,
    phoneFrom: "+5491111111111",
    phoneTo: "+5491199999999",
    messageType: "TEXT",
    body: `msg-${index}`,
    latitude: null,
    longitude: null,
    status: "RECEIVED",
    rawPayload: null,
    processingStatus: "RECEIVED",
    processingErrorCode: null,
    processedAt: null,
    createdAt,
  };
}

describe("whatsappObservabilityService.listMessages", () => {
  it("returns 404 when conversation does not exist", async () => {
    mock.reset();
    const { whatsappObservabilityRepository } = await import(
      "../repositories/whatsapp-observability.repository"
    );
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => null);
    const listSpy = mock.method(whatsappObservabilityRepository, "listMessages", async () => {
      throw new Error("should not list messages for missing conversation");
    });

    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    await assert.rejects(
      () =>
        whatsappObservabilityService.listMessages("22222222-2222-2222-2222-222222222222", {
          limit: 50,
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "CONVERSATION_NOT_FOUND",
    );
    assert.equal(listSpy.mock.callCount(), 0);
  });

  it("maps repository cursor metadata without clamping invalid limits", async () => {
    mock.reset();
    const conversationId = "22222222-2222-2222-2222-222222222222";
    const msg = buildMessage(1, "2026-01-01T00:01:00.000Z");
    let received: unknown;
    const { whatsappObservabilityRepository } = await import(
      "../repositories/whatsapp-observability.repository"
    );
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => ({
      id: conversationId,
      companyId: null,
    }));
    mock.method(whatsappObservabilityRepository, "listMessages", async (_id, query) => {
      received = query;
      return {
        data: [msg],
        hasMore: true,
        nextCursor: { createdAt: msg.createdAt, id: msg.id },
      };
    });

    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    const result = await whatsappObservabilityService.listMessages(conversationId, {
      limit: 50,
      beforeCreatedAt: "2026-01-02T00:00:00.000Z",
      beforeId: "33333333-3333-3333-3333-333333333333",
    });

    assert.deepEqual(received, {
      limit: 50,
      beforeCreatedAt: "2026-01-02T00:00:00.000Z",
      beforeId: "33333333-3333-3333-3333-333333333333",
      direction: undefined,
    });
    assert.equal(result.meta.hasMore, true);
    assert.equal(result.meta.limit, 50);
    assert.deepEqual(result.meta.nextCursor, { createdAt: msg.createdAt, id: msg.id });
  });

  it("returns empty data for conversations without messages", async () => {
    mock.reset();
    const conversationId = "22222222-2222-2222-2222-222222222222";
    const { whatsappObservabilityRepository } = await import(
      "../repositories/whatsapp-observability.repository"
    );
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => ({
      id: conversationId,
      companyId: null,
    }));
    mock.method(whatsappObservabilityRepository, "listMessages", async () => ({
      data: [],
      hasMore: false,
      nextCursor: null,
    }));

    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    const result = await whatsappObservabilityService.listMessages(conversationId, {
      limit: 50,
    });
    assert.deepEqual(result.data, []);
    assert.equal(result.meta.hasMore, false);
    assert.equal(result.meta.nextCursor, null);
  });
});
