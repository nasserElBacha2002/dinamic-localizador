import { setupDomEnvironment } from "../../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, WHATSAPP_OBSERVABILITY_API_EXPORTS } from "../../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../../api/company-path";
import { installLayoutPolyfills } from "../../../test/layout-polyfills";
import { mockViewport } from "../../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const conversationRequests: Array<Record<string, unknown>> = [];

mockApiModule(
  "api/whatsapp-observability.api",
  {
    getWhatsappConversations: async (filters: Record<string, unknown> = {}) => {
      conversationRequests.push({ ...filters });
      return {
        data: [
          {
            id: "conv-1",
            companyId: "co-1",
            employeeId: "emp-1",
            phoneMasked: "****1234",
            startedAt: "2026-08-01T10:00:00.000Z",
            lastActivityAt: "2026-08-01T10:05:00.000Z",
            status: "ACTIVE",
            lastFlowType: "INBOUND_TEXT",
            lastResultCode: "CHECKIN_COMPLETED",
            messageCount: 4,
            errorCount: 0,
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
    },
    getWhatsappObservabilityEmployeeLookups: async (query: Record<string, unknown> = {}) => {
      const all = [
        {
          id: "emp-1",
          fullName: "Ana Pérez",
          companyId: "co-1",
          companyName: "Empresa A",
        },
        {
          id: "emp-2",
          fullName: "Bruno Díaz",
          companyId: "co-2",
          companyName: "Empresa B",
        },
      ];
      if (typeof query.id === "string") {
        return all.filter((row) => row.id === query.id);
      }
      const search = String(query.search ?? "")
        .trim()
        .toLowerCase();
      if (!search) {
        return all;
      }
      return all.filter((row) => row.fullName.toLowerCase().includes(search));
    },
    getWhatsappConversationById: async () => {
      throw new Error("not used");
    },
    getWhatsappConversationMessages: async () => ({
      data: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
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
  },
  WHATSAPP_OBSERVABILITY_API_EXPORTS,
);

mockApiModule("api/lookups.api", {
  getEmployeeLookups: async () => {
    throw new Error("company lookup must not be used on platform observability");
  },
  getServiceLookups: async () => [],
  getOperationLookups: async () => [],
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
import { Route, Routes, useLocation } from "react-router";

let renderPage: typeof import("../../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../../test/render-page").clearActiveTestQueryClients;
let WhatsappObservabilityPage: React.ComponentType;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../../test/render-page"));
  ({ WhatsappObservabilityPage } = await import("./WhatsappObservabilityPage"));
});

beforeEach(() => {
  conversationRequests.length = 0;
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
  setRuntimeCompanyId("co-1");
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

describe("WhatsappObservabilityPage filters", () => {
  it("renders collaborator lookup and hides general search / phone filters", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      { route: "/platform/observability/whatsapp", auth: platformAuth },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));
    assert.ok(view.getByLabelText("Colaborador"));
    assert.equal(view.queryByLabelText("Búsqueda general"), null);
    assert.equal(view.queryByLabelText("Teléfono"), null);
  });

  it("sends employeeId when URL has a collaborator selected and omits empty params", async () => {
    mockViewport("desktop");
    renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      {
        route: "/platform/observability/whatsapp?employeeId=emp-1&status=ACTIVE&hasError=false",
        auth: platformAuth,
      },
    );

    await waitFor(() => assert.ok(conversationRequests.length > 0));
    const latest = conversationRequests[conversationRequests.length - 1];
    assert.equal(latest.employeeId, "emp-1");
    assert.equal(latest.status, "ACTIVE");
    assert.equal(latest.hasError, false);
    assert.equal("search" in latest, false);
    assert.equal("phone" in latest, false);
    assert.equal("flowType" in latest && latest.flowType === "", false);
  });

  it("resets page to 1 when clearing filters from a deep page", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      {
        route: "/platform/observability/whatsapp?page=4&status=ACTIVE&employeeId=emp-1",
        auth: platformAuth,
      },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));
    await waitFor(() => {
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.page, 4);
      assert.equal(latest.status, "ACTIVE");
    });

    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => {
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.page, 1);
      assert.equal(latest.status, undefined);
      assert.equal(latest.employeeId, undefined);
    });
  });

  it("resets page to 1 when selecting a collaborator from page 4", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route
          path="/platform/observability/whatsapp"
          element={
            <>
              <LocationProbe />
              <WhatsappObservabilityPage />
            </>
          }
        />
      </Routes>,
      {
        route: "/platform/observability/whatsapp?page=4",
        auth: platformAuth,
      },
    );

    await waitFor(() => {
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.page, 4);
    });

    const input = view.getByLabelText("Colaborador");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Bruno" } });

    const option = await view.findByText("Bruno Díaz", {}, { timeout: 2000 });
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    await waitFor(() => {
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.employeeId, "emp-2");
      assert.equal(latest.page, 1);
      assert.match(view.getByTestId("location-search").textContent ?? "", /employeeId=emp-2/);
      assert.doesNotMatch(view.getByTestId("location-search").textContent ?? "", /page=4/);
    });
  });

  it("resets page to 1 when changing Actividad from page 4", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      {
        route: "/platform/observability/whatsapp?page=4",
        auth: platformAuth,
      },
    );

    await waitFor(() => {
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.page, 4);
    });

    fireEvent.click(view.getByLabelText("Actividad"));
    await waitFor(() => assert.ok(view.getByText("Últimos 7 días")));
    fireEvent.click(view.getByText("Últimos 7 días"));

    await waitFor(() => {
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.page, 1);
      assert.ok(typeof latest.from === "string");
      assert.ok(typeof latest.to === "string");
    });
  });

  it("selects collaborator via autocomplete and sends employeeId with page 1", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route
          path="/platform/observability/whatsapp"
          element={
            <>
              <LocationProbe />
              <WhatsappObservabilityPage />
            </>
          }
        />
      </Routes>,
      { route: "/platform/observability/whatsapp", auth: platformAuth },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));

    const input = view.getByLabelText("Colaborador");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Ana" } });

    const option = await view.findByText("Ana Pérez", {}, { timeout: 2000 });
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    await waitFor(() => {
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.employeeId, "emp-1");
      assert.equal(latest.page, 1);
      assert.match(view.getByTestId("location-search").textContent ?? "", /employeeId=emp-1/);
    });
    assert.ok(view.getByDisplayValue("Ana Pérez"));
  });

  it("clears collaborator and all filters with Limpiar filtros", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      {
        route:
          "/platform/observability/whatsapp?employeeId=emp-1&status=ACTIVE&flowType=INBOUND_TEXT&hasError=true",
        auth: platformAuth,
      },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));

    const clearButton = () =>
      view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement;
    await waitFor(() => assert.equal(clearButton().disabled, false));

    fireEvent.click(clearButton());
    await waitFor(() => {
      assert.equal(clearButton().disabled, true);
      const latest = conversationRequests[conversationRequests.length - 1];
      assert.equal(latest.employeeId, undefined);
      assert.equal(latest.status, undefined);
      assert.equal(latest.flowType, undefined);
      assert.equal(latest.hasError, undefined);
      assert.equal(latest.page, 1);
    });
  });

  it("keeps Limpiar fecha available under Actividad without breaking the grid", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      {
        route:
          "/platform/observability/whatsapp?datePreset=last_7_days&dateFrom=2026-08-14&dateTo=2026-08-20",
        auth: platformAuth,
      },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));
    assert.ok(view.getByRole("button", { name: "Limpiar rango de fechas" }));
    assert.ok(view.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => {
      const withBounds = conversationRequests.find(
        (request) => typeof request.from === "string" && typeof request.to === "string",
      );
      assert.ok(withBounds);
      assert.match(String(withBounds.from), /T/);
      assert.match(String(withBounds.to), /T/);
    });
  });

  it("resolves activity preset from URL without requiring dateFrom/dateTo", async () => {
    mockViewport("desktop");
    renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      { route: "/platform/observability/whatsapp?datePreset=last_7_days", auth: platformAuth },
    );

    await waitFor(() => {
      const withBounds = conversationRequests.find(
        (request) => typeof request.from === "string" && typeof request.to === "string",
      );
      assert.ok(withBounds);
      assert.match(String(withBounds.from), /T/);
      assert.match(String(withBounds.to), /T/);
    });
  });

  it("uses mobile drawer for secondary filters without removing clear action", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/platform/observability/whatsapp" element={<WhatsappObservabilityPage />} />
      </Routes>,
      { route: "/platform/observability/whatsapp", auth: platformAuth },
    );

    await waitFor(() => assert.ok(view.getByText("****1234")));
    assert.ok(view.getByRole("button", { name: "Filtros" }));
    assert.ok(view.getByRole("button", { name: "Limpiar filtros" }));
    assert.ok(view.getByLabelText("Colaborador"));
  });
});
