import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["employees:read", "operations:read", "attendance:read"],
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

mockApiModule("api/company-modules.api", {
  getCompanyModules: async () => [
    { key: "attendance", enabled: true },
    { key: "operations", enabled: true },
    { key: "absences", enabled: true },
    { key: "reports", enabled: true },
  ],
  updateCompanyModules: async () => [],
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let AppLayout: React.ComponentType<{ children?: React.ReactNode }>;
let AppSidebar: React.ComponentType<{ onNavigate?: () => void }>;
let CompanySwitcher: React.ComponentType<{ compact?: boolean }>;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ AppLayout } = await import("./AppLayout"));
  ({ AppSidebar } = await import("./AppSidebar"));
  ({ CompanySwitcher } = await import("./CompanySwitcher"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("AppLayout shell responsive (real layout)", () => {
  it("renders topbar burger control and main content", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route
          path="/"
          element={
            <AppLayout>
              <div>Contenido principal</div>
            </AppLayout>
          }
        />
      </Routes>,
      { route: "/" },
    );

    await waitFor(() => assert.ok(view.getByText("Contenido principal")));
    assert.ok(view.getByLabelText("Abrir menú"));
  });

  it("renders sidebar navigation and closes on navigate callback", async () => {
    mockViewport("mobile");
    let closed = false;
    const view = renderPage(
      <Routes>
        <Route
          path="/"
          element={
            <AppSidebar
              onNavigate={() => {
                closed = true;
              }}
            />
          }
        />
      </Routes>,
      { route: "/" },
    );

    await waitFor(() => assert.ok(view.getByRole("navigation", { name: "Navegación principal" })));
    const link = view.getAllByRole("link")[0];
    assert.ok(link);
    fireEvent.click(link);
    assert.equal(closed, true);
  });

  it("renders company switcher for multi-company users", async () => {
    mockViewport("mobile");
    const view = renderPage(<CompanySwitcher compact />, {
      route: "/",
      company: {
        companies: [
          {
            companyId: "co-1",
            companyName: "Empresa Test",
            role: "ADMIN",
            isDefault: true,
            status: "ACTIVE",
          },
          {
            companyId: "co-2",
            companyName: "Otra Empresa",
            role: "OPERATOR",
            isDefault: false,
            status: "ACTIVE",
          },
        ],
        activeCompany: {
          companyId: "co-1",
          companyName: "Empresa Test",
          role: "ADMIN",
          isDefault: true,
          status: "ACTIVE",
        },
      },
    });

    await waitFor(() => assert.ok(view.getByLabelText("Cambiar empresa activa")));
  });
});
