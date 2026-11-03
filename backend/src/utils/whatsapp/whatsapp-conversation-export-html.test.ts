import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderWhatsappConversationExportHtml } from "./whatsapp-conversation-export-html";

describe("whatsapp conversation export html", () => {
  it("renders chronological messages and escapes html", () => {
    const html = renderWhatsappConversationExportHtml({
      exportedAt: "2026-11-02T12:00:00.000Z",
      header: {
        conversationId: "11111111-1111-1111-1111-111111111111",
        phoneMasked: "****1234",
        companyId: "22222222-2222-2222-2222-222222222222",
        employeeId: "33333333-3333-3333-3333-333333333333",
        status: "ACTIVE",
        startedAt: "2026-11-01T10:00:00.000Z",
        lastActivityAt: "2026-11-02T11:00:00.000Z",
        messageCount: 2,
        errorCount: 1,
        lastResultCode: "ABSENCE_FLOW",
        lastFlowType: "ABSENCE",
      },
      messages: [
        {
          id: "a",
          createdAt: "2026-11-01T10:01:00.000Z",
          direction: "INBOUND",
          body: "<script>alert(1)</script>",
          providerStatus: null,
          messageSid: "SM1",
          errorCode: null,
          errorMessage: null,
        },
        {
          id: "b",
          createdAt: "2026-11-01T10:02:00.000Z",
          direction: "OUTBOUND",
          body: "OK",
          providerStatus: "delivered",
          messageSid: "SM2",
          errorCode: "63016",
          errorMessage: "failed",
        },
      ],
      executions: [],
      providerEvents: [],
      technicalIds: {
        conversationId: "11111111-1111-1111-1111-111111111111",
        employeeId: "33333333-3333-3333-3333-333333333333",
        companyId: "22222222-2222-2222-2222-222222222222",
        messageIds: ["a", "b"],
        flowExecutionIds: [],
        requestIds: [],
      },
      exportMeta: {
        totalMessageCount: 2,
        exportedMessageCount: 2,
        expectedExportCount: 2,
        truncatedByHardCap: false,
        incompleteLoad: false,
        truncated: false,
      },
    });

    assert.match(html, /Empleado/);
    assert.match(html, /Sistema/);
    assert.match(html, /2026-11-01T10:01:00.000Z/);
    assert.match(html, /2026-11-01T10:02:00.000Z/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it("shows incomplete export banner when truncated", () => {
    const html = renderWhatsappConversationExportHtml({
      exportedAt: "2026-11-02T12:00:00.000Z",
      header: {
        conversationId: "11111111-1111-1111-1111-111111111111",
        phoneMasked: "****1234",
        companyId: null,
        employeeId: null,
        status: "ACTIVE",
        startedAt: "2026-11-01T10:00:00.000Z",
        lastActivityAt: "2026-11-02T11:00:00.000Z",
        messageCount: 5732,
        errorCount: 0,
        lastResultCode: null,
        lastFlowType: null,
      },
      messages: [],
      executions: [],
      providerEvents: [],
      technicalIds: {
        conversationId: "11111111-1111-1111-1111-111111111111",
        employeeId: null,
        companyId: null,
        messageIds: [],
        flowExecutionIds: [],
        requestIds: [],
      },
      exportMeta: {
        totalMessageCount: 5732,
        exportedMessageCount: 5000,
        expectedExportCount: 5732,
        truncatedByHardCap: false,
        incompleteLoad: true,
        truncated: true,
      },
    });
    assert.match(html, /Export incompleto/);
    assert.match(html, /se esperaban 5732 mensajes/);
  });
});
