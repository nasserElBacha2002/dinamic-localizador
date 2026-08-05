import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../test/mock-api-module";
import { setRuntimeCompanyId } from "../api/company-path";
import { installLayoutPolyfills } from "../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

let statusCallCount = 0;

mockApiModule("api/platform-server-status.api", {
  getPlatformServerStatus: async () => {
    statusCallCount += 1;
    return {
      status: "ok",
      backend: {
        status: "ok",
        service: "dinamic-attendance-api",
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      database: {
        status: "ok",
        message: null,
        durationMs: 1,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      gcs: {
        status: "disabled",
        message: "Almacenamiento no configurado",
        durationMs: 1,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      timestamp: "2026-08-04T12:00:00.000Z",
    };
  },
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { getAdminNavItems } from "../utils/company-modules";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../test/render-page").clearActiveTestQueryClients;
let FeatureRouteGuard: typeof import("../components/company/FeatureRouteGuard").FeatureRouteGuard;
let ServerStatusPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../test/render-page"));
  ({ FeatureRouteGuard } = await import("../components/company/FeatureRouteGuard"));
  ({ ServerStatusPage } = await import("../pages/platform/ServerStatusPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  statusCallCount = 0;
});

function PlatformServersRoute() {
  return (
    <Routes>
      <Route
        path="/platform/servers"
        element={
          <FeatureRouteGuard requirePlatformAdmin>
            <ServerStatusPage />
          </FeatureRouteGuard>
        }
      />
    </Routes>
  );
}

describe("platform servers access via FeatureRouteGuard (AppRoutes contract)", () => {
  it("wires /platform/servers behind FeatureRouteGuard in AppRoutes", () => {
    const routesFile = readFileSync(join(process.cwd(), "src/routes/AppRoutes.tsx"), "utf8");
    assert.match(routesFile, /path="\/platform\/servers"/);
    assert.match(routesFile, /requirePlatformAdmin/);
    assert.match(routesFile, /ServerStatusPage/);
  });

  it("blocks direct URL for company admin and does not call API", async () => {
    const view = renderPage(<PlatformServersRoute />, {
      route: "/platform/servers",
      auth: {
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Company Admin",
          role: "ADMIN",
          isPlatformAdmin: false,
        },
      },
    });

    await waitFor(() => assert.ok(view.getByText("Sin permisos")));
    assert.equal(statusCallCount, 0);
    assert.equal(
      getAdminNavItems({
        modules: [],
        permissions: ["company:settings:update", "users:manage"],
        isPlatformAdmin: false,
        modulesLoading: false,
      }).some((item) => item.path === "/platform/servers"),
      false,
    );
  });

  it("blocks standard user and hides nav", async () => {
    const view = renderPage(<PlatformServersRoute />, {
      route: "/platform/servers",
      auth: {
        user: {
          id: "user-1",
          email: "user@example.com",
          name: "Operator",
          role: "OPERATOR",
          isPlatformAdmin: false,
        },
      },
    });

    await waitFor(() => assert.ok(view.getByText("Sin permisos")));
    assert.equal(statusCallCount, 0);
  });

  it("allows Super Admin when auth user is platform admin", async () => {
    const view = renderPage(<PlatformServersRoute />, {
      route: "/platform/servers",
      auth: {
        user: {
          id: "super-1",
          email: "super@example.com",
          name: "Super",
          role: "ADMIN",
          isPlatformAdmin: true,
        },
      },
      company: {
        activeCompany: {
          companyId: "co-2",
          companyName: "Empresa B",
          role: "OWNER",
          isDefault: false,
          status: "ACTIVE",
        },
      },
    });

    await waitFor(() => assert.ok(view.getByText("Estado de servidores")));
    await waitFor(() => assert.ok(view.getByText(/dinamic-attendance-api/)));
    assert.ok(statusCallCount >= 1);
  });

  it("keeps Super Admin access when active company changes", async () => {
    const view = renderPage(<PlatformServersRoute />, {
      route: "/platform/servers",
      auth: {
        user: {
          id: "super-1",
          email: "super@example.com",
          name: "Super",
          role: "ADMIN",
          isPlatformAdmin: true,
        },
      },
      company: {
        activeCompany: {
          companyId: "co-2",
          companyName: "Empresa B",
          role: "OWNER",
          isDefault: false,
          status: "ACTIVE",
        },
      },
    });

    await waitFor(() => assert.ok(view.getByText("Estado de servidores")));
    assert.equal(view.queryByText("Sin permisos"), null);
  });
});
