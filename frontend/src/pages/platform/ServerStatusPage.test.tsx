import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

let statusResolver: (() => Promise<unknown>) | null = null;
let statusCallCount = 0;

mockApiModule("api/platform-server-status.api", {
  getPlatformServerStatus: async () => {
    statusCallCount += 1;
    if (statusResolver) {
      return statusResolver();
    }
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
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";
import { ApiError } from "../../utils/errors";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let ServerStatusPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ ServerStatusPage } = await import("./ServerStatusPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  statusResolver = null;
  statusCallCount = 0;
});

beforeEach(() => {
  statusCallCount = 0;
  statusResolver = null;
});

const superAuth = {
  user: {
    id: "super-1",
    email: "super@example.com",
    name: "Super Admin",
    role: "ADMIN" as const,
    isPlatformAdmin: true,
  },
  isLoading: false,
};

describe("ServerStatusPage rendering", () => {
  it("renders ok snapshot for Super Admin", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/platform/servers" element={<ServerStatusPage />} />
      </Routes>,
      { route: "/platform/servers", auth: superAuth },
    );

    await waitFor(() => assert.ok(view.getByText("Estado de servidores")));
    await waitFor(() => assert.ok(view.getByText(/dinamic-attendance-api/)));
    assert.ok(view.getByText("No configurado"));
  });

  it("renders degraded snapshot without generic ErrorState", async () => {
    statusResolver = async () => ({
      status: "degraded",
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
        status: "error",
        message: "Almacenamiento inaccesible",
        durationMs: 20,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      timestamp: "2026-08-04T12:00:00.000Z",
    });

    const view = renderPage(
      <Routes>
        <Route path="/platform/servers" element={<ServerStatusPage />} />
      </Routes>,
      { route: "/platform/servers", auth: superAuth },
    );

    await waitFor(() => assert.ok(view.getByText("Degradado")));
    assert.ok(view.getByText("Almacenamiento inaccesible"));
    assert.equal(view.queryByText(/No se pudo obtener el estado/), null);
  });

  it("renders error snapshot with SQL failure and remaining components", async () => {
    statusResolver = async () => ({
      status: "error",
      backend: {
        status: "ok",
        service: "dinamic-attendance-api",
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      database: {
        status: "error",
        message: "No se pudo conectar con la base de datos",
        durationMs: 10,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      gcs: {
        status: "ok",
        message: null,
        durationMs: 4,
        checkedAt: "2026-08-04T12:00:00.000Z",
      },
      timestamp: "2026-08-04T12:00:00.000Z",
    });

    const view = renderPage(
      <Routes>
        <Route path="/platform/servers" element={<ServerStatusPage />} />
      </Routes>,
      { route: "/platform/servers", auth: superAuth },
    );

    await waitFor(() => assert.ok(view.getByText("No se pudo conectar con la base de datos")));
    assert.ok(view.getByText("Disponible"));
    assert.ok(view.getAllByText("Con error").length >= 1);
  });

  it("shows ErrorState on transport failure without valid payload", async () => {
    statusResolver = async () => {
      throw new ApiError(
        "No se pudo construir el estado de servidores.",
        "SERVER_STATUS_UNAVAILABLE",
        500,
      );
    };

    const view = renderPage(
      <Routes>
        <Route path="/platform/servers" element={<ServerStatusPage />} />
      </Routes>,
      { route: "/platform/servers", auth: superAuth },
    );

    await waitFor(() =>
      assert.ok(view.getByText("No se pudo construir el estado de servidores.")),
    );
  });

  it("does not flash denial while auth is loading", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/platform/servers" element={<ServerStatusPage />} />
      </Routes>,
      {
        route: "/platform/servers",
        auth: {
          user: null,
          isLoading: true,
          isAuthenticated: false,
        },
      },
    );

    assert.ok(view.getByText("Cargando acceso..."));
    assert.equal(
      view.queryByText(
        "Solo un superadministrador de plataforma puede ver el estado de servidores.",
      ),
      null,
    );
  });

  it("rejects company admin without calling status API", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/platform/servers" element={<ServerStatusPage />} />
      </Routes>,
      {
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
      },
    );

    await waitFor(() =>
      assert.ok(
        view.getByText(
          "Solo un superadministrador de plataforma puede ver el estado de servidores.",
        ),
      ),
    );
    assert.equal(statusCallCount, 0);
  });
});
