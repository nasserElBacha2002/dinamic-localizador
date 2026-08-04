import { setupDomEnvironment } from "../../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../../api/company-path";
import { installLayoutPolyfills } from "../../../test/layout-polyfills";
import { mockViewport } from "../../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const conversationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

let lastMessagesRequest: { page?: number; limit?: number } | null = null;
let messagesPages: Map<number, { id: string; body: string; createdAt: string }[]> = new Map();
let messagesTotal = 0;
let messagesShouldFail = false;

function resetMessagesFixture(total: number, pageSize = 50) {
  messagesTotal = total;
  messagesShouldFail = false;
  lastMessagesRequest = null;
  messagesPages = new Map();
  const all = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const minutes = n % 60;
    const hours = Math.floor(n / 60);
    return {
      id: `${String(n).padStart(8, "0")}-1111-1111-1111-111111111111`,
      body: `msg-${n}`,
      createdAt: `2026-01-01T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`,
      conversationId,
      messageSid: null,
      direction: n % 2 === 0 ? ("OUTBOUND" as const) : ("INBOUND" as const),
      employeeId: null,
      phoneFrom: "****1111",
      phoneTo: "****9999",
      messageType: "TEXT" as const,
      latitude: null,
      longitude: null,
      status: null,
      processingStatus: null,
      processingErrorCode: null,
      correlationId: null,
      causationId: null,
      provider: null,
      providerMessageSid: null,
      templateSid: null,
      templateName: null,
      templateVariablesJson: null,
      providerStatus: null,
      providerErrorCode: null,
      providerErrorMessage: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      updatedAt: null,
      notificationId: null,
    };
  });
  // newest-first pages, returned chrono ASC within page (as backend does)
  const newestFirst = [...all].reverse();
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  for (let page = 1; page <= Math.max(totalPages, 1); page += 1) {
    const offset = (page - 1) * pageSize;
    const windowNewestFirst = newestFirst.slice(offset, offset + pageSize);
    messagesPages.set(page, [...windowNewestFirst].reverse());
  }
}

mockApiModule("api/whatsapp-observability.api", {
  getWhatsappConversations: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
  getWhatsappConversationById: async () => ({
    id: conversationId,
    companyId: "co-1",
    employeeId: null,
    phoneMasked: "****1234",
    phoneHash: "hash",
    startedAt: "2026-08-01T10:00:00.000Z",
    lastActivityAt: "2026-08-01T10:05:00.000Z",
    status: "ACTIVE",
    lastFlowType: "CHECKIN",
    lastResultCode: "CHECKIN_COMPLETED",
    messageCount: messagesTotal,
    errorCount: 0,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:05:00.000Z",
    recentExecutions: [],
  }),
  getWhatsappConversationMessages: async (
    _id: string,
    filters: { page?: number; limit?: number } = {},
  ) => {
    lastMessagesRequest = { ...filters };
    if (messagesShouldFail) {
      const { ApiError } = await import("../../../utils/errors");
      throw new ApiError("Too big: expected number to be <=100", "VALIDATION_ERROR", 400);
    }
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const data = messagesPages.get(page) ?? [];
    const totalPages = messagesTotal === 0 ? 0 : Math.ceil(messagesTotal / limit);
    return {
      data,
      meta: {
        page,
        limit,
        total: messagesTotal,
        totalPages,
        hasMore: totalPages > 0 && page < totalPages,
      },
    };
  },
  getWhatsappConversationProviderEvents: async () => [],
  getWhatsappMessageById: async () => {
    throw new Error("not used");
  },
  getWhatsappFlowExecutionById: async () => {
    throw new Error("not used");
  },
  getWhatsappErrors: async () => ({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
  getWhatsappErrorByCode: async () => {
    throw new Error("not used");
  },
  getWhatsappNotificationById: async () => {
    throw new Error("not used");
  },
  revealWhatsappConversationPhone: async () => ({ phoneNormalized: "+5491112345678" }),
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: true,
    permissions: [],
  }),
  getCompanyUsers: async () => ({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  }),
  getCompanyUserById: async () => {
    throw new Error("not used");
  },
  createCompanyUser: async () => {
    throw new Error("not used");
  },
  updateCompanyUser: async () => {
    throw new Error("not used");
  },
  deactivateCompanyUser: async () => {
    throw new Error("not used");
  },
  getActiveCompanyMembershipPath: () => null,
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../../test/render-page").clearActiveTestQueryClients;
let WhatsappConversationDetailPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../../test/render-page"));
  ({ WhatsappConversationDetailPage } = await import("./WhatsappConversationDetailPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

const platformAuth = {
  user: {
    id: "user-1",
    email: "admin@example.com",
    name: "Platform Admin",
    role: "ADMIN" as const,
    isPlatformAdmin: true,
  },
};

function renderDetail() {
  return renderPage(
    <Routes>
      <Route
        path="/platform/observability/whatsapp/:conversationId"
        element={<WhatsappConversationDetailPage />}
      />
    </Routes>,
    {
      route: `/platform/observability/whatsapp/${conversationId}`,
      auth: platformAuth,
    },
  );
}

describe("WhatsappConversationDetailPage chat", () => {
  beforeEach(() => {
    resetMessagesFixture(0);
  });

  it("never requests a messages limit above 100", async () => {
    resetMessagesFixture(10);
    const view = renderDetail();
    await waitFor(() => assert.ok(view.getByText("****1234")));
    await waitFor(() => assert.ok(lastMessagesRequest));
    assert.ok((lastMessagesRequest?.limit ?? 0) <= 100);
    assert.equal(lastMessagesRequest?.limit, 50);
  });

  it("loads the first (newest) page and shows empty state", async () => {
    resetMessagesFixture(0);
    const view = renderDetail();
    await waitFor(() =>
      assert.ok(view.getByText("No hay mensajes registrados para esta conversación.")),
    );
  });

  it("loads first page of messages in chronological order", async () => {
    resetMessagesFixture(3);
    const view = renderDetail();
    await waitFor(() => assert.ok(view.getByText("msg-1")));
    assert.ok(view.getByText("msg-2"));
    assert.ok(view.getByText("msg-3"));
    const bodies = view.getAllByText(/msg-\d+/).map((el) => el.textContent);
    assert.deepEqual(bodies, ["msg-1", "msg-2", "msg-3"]);
  });

  it("loads older messages without duplicates", async () => {
    resetMessagesFixture(120);
    const view = renderDetail();
    await waitFor(() => assert.ok(view.getByText("msg-120")));
    assert.ok(view.getByText("msg-71"));
    assert.equal(view.queryByText("msg-1"), null);

    fireEvent.click(view.getByRole("button", { name: "Cargar mensajes anteriores" }));
    await waitFor(() => assert.ok(view.getByText("msg-21")));
    assert.equal(view.getAllByText("msg-71").length, 1);

    fireEvent.click(view.getByRole("button", { name: "Cargar mensajes anteriores" }));
    await waitFor(() => assert.ok(view.getByText("msg-1")));
    assert.equal(view.getAllByText("msg-120").length, 1);
    await waitFor(() => assert.ok(view.getByText(/Fin del historial/)));
  });

  it("shows friendly chat error with retry and keeps summary visible", async () => {
    resetMessagesFixture(5);
    messagesShouldFail = true;
    const view = renderDetail();
    await waitFor(() => assert.ok(view.getByText("****1234")));
    await waitFor(() =>
      assert.ok(view.getByText("No se pudieron cargar los mensajes de la conversación.")),
    );
    assert.equal(view.queryByText("Too big: expected number to be <=100"), null);
    assert.ok(view.getByText("Resumen"));
    assert.ok(view.getByRole("button", { name: "Reintentar" }));

    messagesShouldFail = false;
    fireEvent.click(view.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => assert.ok(view.getByText("msg-1")));
  });
});
