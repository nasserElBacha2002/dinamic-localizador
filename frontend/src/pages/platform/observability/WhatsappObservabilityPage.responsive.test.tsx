import { setupDomEnvironment } from "../../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../../api/company-path";
import { installLayoutPolyfills } from "../../../test/layout-polyfills";
import { mockViewport } from "../../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule("api/whatsapp-observability.api", {
  getWhatsappConversations: async () => ({
    data: [
      {
        id: "conv-1",
        companyId: "co-1",
        employeeId: "emp-1",
        phoneMasked: "****1234",
        startedAt: "2026-08-01T10:00:00.000Z",
        lastActivityAt: "2026-08-01T10:05:00.000Z",
        status: "ACTIVE",
        lastFlowType: "CHECKIN",
        lastResultCode: "CHECKIN_COMPLETED",
        messageCount: 4,
        errorCount: 0,
      },
    ],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  }),
  getWhatsappConversationById: async () => {
    throw new Error("not used");
  },
  getWhatsappConversationMessages: async () => ({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getWhatsappConversationProviderEvents: async () => [],
  getWhatsappMessageById: async () => {
    throw new Error("not used");
  },
  getWhatsappFlowExecutionById: async () => {
    throw new Error("not used");
  },
  getWhatsappErrors: async () => ({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getWhatsappErrorByCode: async () => {
    throw new Error("not used");
  },
  getWhatsappNotificationById: async () => {
    throw new Error("not used");
  },
  revealWhatsappConversationPhone: async () => {
    throw new Error("not used");
  },
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: true,
    permissions: [],
  }),
  getCompanyUsers: async () => ({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
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

mockApiModule("api/lookups.api", {
  getEmployeeLookups: async () => [],
  getServiceLookups: async () => [],
  getOperationLookups: async () => [],
});

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../../test/render-page").clearActiveTestQueryClients;
let WhatsappObservabilityPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../../test/render-page"));
  ({ WhatsappObservabilityPage } = await import("./WhatsappObservabilityPage"));
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

const regularAuth = {
  user: {
    id: "user-2",
    email: "user@example.com",
    name: "Regular User",
    role: "ADMIN" as const,
    isPlatformAdmin: false,
  },
};

describe("WhatsappObservabilityPage responsive (real page)", () => {
  it("shows desktop table for platform admin", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      { route: "/platform/observability/whatsapp", auth: platformAuth },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile cards for platform admin", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      { route: "/platform/observability/whatsapp", auth: platformAuth },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));
    assert.equal(view.queryByRole("table"), null);
  });

  it("denies access for non-platform admin", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      { route: "/platform/observability/whatsapp", auth: regularAuth },
    );

    assert.ok(
      view.getByText(
        "Solo un superadministrador de plataforma puede acceder a la observabilidad de WhatsApp.",
      ),
    );
    assert.equal(view.queryByRole("table"), null);
  });
});
