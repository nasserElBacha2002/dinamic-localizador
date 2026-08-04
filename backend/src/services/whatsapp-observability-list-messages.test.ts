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
          page: 1,
          limit: 50,
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "CONVERSATION_NOT_FOUND",
    );
    assert.equal(listSpy.mock.callCount(), 0);
  });

  it("paginates conversations with more than 100 messages without duplicates", async () => {
    mock.reset();
    const conversationId = "22222222-2222-2222-2222-222222222222";
    const total = 120;
    // Repo returns chronological ASC within each newest-first window (already reversed).
    const allNewestFirst = Array.from({ length: total }, (_, i) => {
      const index = total - i;
      return buildMessage(index, `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`);
    });

    const { whatsappObservabilityRepository } = await import(
      "../repositories/whatsapp-observability.repository"
    );
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => ({
      id: conversationId,
      companyId: "33333333-3333-3333-3333-333333333333",
    }));
    mock.method(
      whatsappObservabilityRepository,
      "listMessages",
      async (_id: string, page: number, limit: number) => {
        const offset = (page - 1) * limit;
        const windowNewestFirst = allNewestFirst.slice(offset, offset + limit);
        return {
          data: [...windowNewestFirst].reverse(),
          total,
        };
      },
    );

    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");

    const page1 = await whatsappObservabilityService.listMessages(conversationId, {
      page: 1,
      limit: 50,
    });
    const page2 = await whatsappObservabilityService.listMessages(conversationId, {
      page: 2,
      limit: 50,
    });
    const page3 = await whatsappObservabilityService.listMessages(conversationId, {
      page: 3,
      limit: 50,
    });

    assert.equal(page1.meta.total, 120);
    assert.equal(page1.meta.totalPages, 3);
    assert.equal(page1.meta.hasMore, true);
    assert.equal(page1.data.length, 50);
    assert.equal(page1.data[0]?.body, "msg-71");
    assert.equal(page1.data[49]?.body, "msg-120");

    assert.equal(page2.meta.hasMore, true);
    assert.equal(page2.data[0]?.body, "msg-21");
    assert.equal(page2.data[49]?.body, "msg-70");

    assert.equal(page3.meta.hasMore, false);
    assert.equal(page3.data.length, 20);
    assert.equal(page3.data[0]?.body, "msg-1");
    assert.equal(page3.data[19]?.body, "msg-20");

    const mergedIds = [...page3.data, ...page2.data, ...page1.data].map((m) => m.id);
    assert.equal(new Set(mergedIds).size, 120);
  });

  it("orders stably when timestamps collide by relying on id DESC fetch order", async () => {
    mock.reset();
    const conversationId = "22222222-2222-2222-2222-222222222222";
    const sameTs = "2026-01-01T12:00:00.000Z";
    const a = buildMessage(1, sameTs);
    const b = buildMessage(2, sameTs);
    // Newest-first window already reversed to ASC by id within equal timestamps:
    // id ...0001 then ...0002
    a.id = "00000001-1111-1111-1111-111111111111";
    b.id = "00000002-1111-1111-1111-111111111111";

    const { whatsappObservabilityRepository } = await import(
      "../repositories/whatsapp-observability.repository"
    );
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => ({
      id: conversationId,
      companyId: null,
    }));
    mock.method(whatsappObservabilityRepository, "listMessages", async () => ({
      data: [a, b],
      total: 2,
    }));

    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    const result = await whatsappObservabilityService.listMessages(conversationId, {
      page: 1,
      limit: 50,
    });
    assert.deepEqual(
      result.data.map((m) => m.id),
      [a.id, b.id],
    );
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
      total: 0,
    }));

    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    const result = await whatsappObservabilityService.listMessages(conversationId, {
      page: 1,
      limit: 50,
    });
    assert.deepEqual(result.data, []);
    assert.equal(result.meta.total, 0);
    assert.equal(result.meta.totalPages, 0);
    assert.equal(result.meta.hasMore, false);
  });

  it("clamps limit to max 100 in service layer", async () => {
    mock.reset();
    const conversationId = "22222222-2222-2222-2222-222222222222";
    let receivedLimit = 0;
    const { whatsappObservabilityRepository } = await import(
      "../repositories/whatsapp-observability.repository"
    );
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => ({
      id: conversationId,
      companyId: null,
    }));
    mock.method(
      whatsappObservabilityRepository,
      "listMessages",
      async (_id: string, _page: number, limit: number) => {
        receivedLimit = limit;
        return { data: [], total: 0 };
      },
    );

    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    await whatsappObservabilityService.listMessages(conversationId, { page: 1, limit: 500 });
    assert.equal(receivedLimit, 100);
  });
});
