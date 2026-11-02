import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  loadConversationMessagesForExport,
  WHATSAPP_EXPORT_MESSAGE_HARD_CAP,
} from "./whatsapp-conversation-export-messages";

describe("loadConversationMessagesForExport", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("paginates until all messages are loaded when under hard cap", async () => {
    const { whatsappObservabilityRepository } = await import(
      "../../repositories/whatsapp/whatsapp-observability.repository"
    );
    const conversationId = "conv-1";
    const total = 1200;

    mock.method(whatsappObservabilityRepository, "countMessagesByConversation", async () => total);

    let pageCalls = 0;
    let offset = 0;
    mock.method(whatsappObservabilityRepository, "listMessagesAscPage", async (input) => {
      pageCalls += 1;
      const size = Math.min(input.limit, total - offset);
      if (size <= 0) {
        return [];
      }
      const batch = Array.from({ length: size }, (_, index) => ({
        id: `m-${offset + index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, offset + index)).toISOString(),
        conversationId,
        direction: "INBOUND" as const,
        body: "hola",
      }));
      offset += size;
      return batch;
    });

    const result = await loadConversationMessagesForExport(conversationId);
    assert.equal(result.totalMessageCount, total);
    assert.equal(result.exportedMessageCount, total);
    assert.equal(result.truncated, false);
    assert.equal(result.messages.length, total);
    assert.ok(pageCalls >= 2);
  });

  it("sets truncated when total exceeds hard cap", async () => {
    const { whatsappObservabilityRepository } = await import(
      "../../repositories/whatsapp/whatsapp-observability.repository"
    );
    const total = WHATSAPP_EXPORT_MESSAGE_HARD_CAP + 732;
    mock.method(whatsappObservabilityRepository, "countMessagesByConversation", async () => total);
    let loaded = 0;
    mock.method(whatsappObservabilityRepository, "listMessagesAscPage", async (input) => {
      const take = Math.min(input.limit, WHATSAPP_EXPORT_MESSAGE_HARD_CAP - loaded);
      if (take <= 0) {
        return [];
      }
      const batch = Array.from({ length: take }, (_, index) => ({
        id: `m-${loaded + index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, loaded + index)).toISOString(),
        conversationId: "conv-2",
        direction: "OUTBOUND" as const,
        body: "ok",
      }));
      loaded += take;
      return batch;
    });

    const result = await loadConversationMessagesForExport("conv-2");
    assert.equal(result.totalMessageCount, total);
    assert.equal(result.truncated, true);
    assert.equal(result.exportedMessageCount, WHATSAPP_EXPORT_MESSAGE_HARD_CAP);
  });
});
