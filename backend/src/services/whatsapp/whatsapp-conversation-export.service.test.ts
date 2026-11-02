import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../../errors/app-error";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

describe("whatsappConversationExportService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns 404 when conversation is missing", async () => {
    setupUnitTestEnv();
    const { whatsappObservabilityRepository } = await import(
      "../../repositories/whatsapp/whatsapp-observability.repository"
    );
    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    const { whatsappConversationExportService } = await import(
      "./whatsapp-conversation-export.service"
    );

    mock.method(whatsappObservabilityService, "assertUiEnabled", () => undefined);
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => null);

    await assert.rejects(
      () =>
        whatsappConversationExportService.exportJson(
          "00000000-0000-0000-0000-000000000000",
          "user-1",
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "CONVERSATION_NOT_FOUND");
        return true;
      },
    );
  });

  it("includes exportMeta and audits truncated exports", async () => {
    setupUnitTestEnv();
    const { whatsappObservabilityRepository } = await import(
      "../../repositories/whatsapp/whatsapp-observability.repository"
    );
    const { whatsappObservabilityService } = await import("./whatsapp-observability.service");
    const { whatsappFlowExecutionRepository } = await import(
      "../../repositories/whatsapp/whatsapp-flow-execution.repository"
    );
    const { whatsappProviderEventRepository } = await import(
      "../../repositories/whatsapp/whatsapp-provider-event.repository"
    );
    const { whatsappConversationExportService } = await import(
      "./whatsapp-conversation-export.service"
    );

    mock.method(whatsappObservabilityService, "assertUiEnabled", () => undefined);
    mock.method(whatsappObservabilityRepository, "getConversationDetail", async () => ({
      id: "conv-1",
      phoneMasked: "****9999",
      companyId: "co-1",
      employeeId: "emp-1",
      status: "ACTIVE",
      startedAt: "2026-11-01T10:00:00.000Z",
      lastActivityAt: "2026-11-02T10:00:00.000Z",
      messageCount: 5732,
      errorCount: 0,
      lastResultCode: null,
      lastFlowType: null,
    }));
    mock.method(whatsappObservabilityRepository, "countMessagesByConversation", async () => 5732);
    mock.method(whatsappObservabilityRepository, "listMessagesAscPage", async () => []);
    mock.method(whatsappFlowExecutionRepository, "listByConversation", async () => []);
    mock.method(whatsappProviderEventRepository, "listByConversation", async () => []);

    let auditTruncated: boolean | undefined;
    mock.method(whatsappObservabilityService, "auditExport", async (_id, _user, _company, meta) => {
      auditTruncated = meta.truncated;
    });

    const doc = await whatsappConversationExportService.exportJson("conv-1", "admin-1");
    assert.equal(doc.exportMeta.truncated, false);
    assert.equal(doc.exportMeta.totalMessageCount, 5732);
    assert.equal(doc.exportMeta.exportedMessageCount, 0);
    assert.equal(auditTruncated, false);
  });
});
