import path from "node:path";
import { mock } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setupDomEnvironment } from "../../../test/setup-dom";

setupDomEnvironment();

let systemLogsUiEnabled = true;
mock.module(
  pathToFileURL(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../utils/system-logs-config.ts"),
  ).href,
  {
    namedExports: {
      isSystemLogsUiEnabled: () => systemLogsUiEnabled,
    },
  },
);

import { mockApiModule, SYSTEM_LOGS_API_EXPORTS } from "../../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../../api/company-path";
import { installLayoutPolyfills } from "../../../test/layout-polyfills";
import { mockViewport } from "../../../test/mock-match-media";
import type { SystemRuntimeLogRow } from "../../../types/system-logs";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const sampleLog: SystemRuntimeLogRow = {
  id: "log-1",
  schemaVersion: 1,
  occurredAt: "2026-08-01T10:00:00.000Z",
  level: "error",
  service: "dinamic-backend",
  serviceInstanceId: "instance-1",
  environment: "test",
  module: "http",
  event: "http.request.failed",
  message: "Request failed with status 500",
  errorCode: "INTERNAL_ERROR",
  requestId: "req-1234567890abcdef",
  correlationId: "corr-abcdef1234567890",
  companyId: "co-1",
  operationId: null,
  employeeId: null,
  conversationId: null,
  jobExecutionId: null,
  metadata: { path: "/api/health" },
  errorName: "Error",
  errorMessage: "boom",
  errorStack: "Error: boom\n    at handler",
  createdAt: "2026-08-01T10:00:01.000Z",
};

let listResolve: ((value: { data: SystemRuntimeLogRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }) => void) | null = null;
let listPending = false;
let listData: SystemRuntimeLogRow[] = [sampleLog];

mockApiModule(
  "api/system-logs.api",
  {
    getSystemLogs: async () => {
      if (listPending) {
        return new Promise((resolve) => {
          listResolve = resolve;
        });
      }
      return {
        data: listData,
        meta: {
          page: 1,
          limit: 20,
          total: listData.length,
          totalPages: listData.length > 0 ? 1 : 0,
        },
      };
    },
    getSystemLogById: async (id: string) => {
      if (id !== sampleLog.id) {
        throw new Error("not found");
      }
      return sampleLog;
    },
    getSystemLogContext: async () => ({
      data: [sampleLog],
      meta: { correlationKey: "requestId" as const },
    }),
    getSystemLogsOptions: async () => ({
      levels: ["error", "warn", "info"],
      modules: ["http", "admin-alert"],
      events: ["http.request.failed"],
      infoEventAllowlist: [],
      queryMaxDays: 7,
      retentionDays: 30,
    }),
  },
  SYSTEM_LOGS_API_EXPORTS,
);

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
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../../test/render-page").clearActiveTestQueryClients;
let SystemLogsPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../../test/render-page"));
  ({ SystemLogsPage } = await import("./SystemLogsPage"));
});

beforeEach(() => {
  listPending = false;
  listResolve = null;
  listData = [sampleLog];
  systemLogsUiEnabled = true;
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

function renderSystemLogsPage(auth = platformAuth) {
  return renderPage(
    <Routes>
      <Route path="/platform/observability/system-logs" element={<SystemLogsPage />} />
    </Routes>,
    { route: "/platform/observability/system-logs", auth },
  );
}

describe("SystemLogsPage", () => {
  it("renders page for platform admin with table data", async () => {
    mockViewport("desktop");
    const view = renderSystemLogsPage();

    await waitFor(() => assert.ok(view.getByText("Logs del sistema")));
    const table = await waitFor(() => {
      const element = view.getByLabelText("Logs del sistema");
      assert.ok(within(element).getByText("http.request.failed"));
      return element;
    });
    assert.ok(table);
    assert.ok(view.getByLabelText("Búsqueda"));
    assert.ok(view.getByLabelText("Request ID"));
  });

  it("denies access for non-platform admin", async () => {
    mockViewport("desktop");
    const view = renderSystemLogsPage(regularAuth);

    assert.ok(
      view.getByText(
        "Solo un superadministrador de plataforma puede acceder a los logs del sistema.",
      ),
    );
    assert.equal(view.queryByLabelText("Logs del sistema"), null);
  });

  it("shows loading state while list query is pending", async () => {
    mockViewport("desktop");
    listPending = true;
    const view = renderSystemLogsPage();

    assert.ok(view.getByLabelText("Cargando..."));
    listResolve?.({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    listPending = false;

    await waitFor(() => assert.ok(view.getByText("No hay logs para los filtros seleccionados")));
  });

  it("shows empty state when no logs match", async () => {
    mockViewport("desktop");
    listData = [];
    const view = renderSystemLogsPage();
    await waitFor(() => assert.ok(view.getByText("No hay logs para los filtros seleccionados")));
    assert.equal(view.queryByLabelText("Logs del sistema"), null);
  });

  it("opens detail drawer on row click", async () => {
    mockViewport("desktop");
    const view = renderSystemLogsPage();

    const table = await waitFor(() => {
      const element = view.getByRole("table");
      assert.ok(within(element).getByText("http.request.failed"));
      return element;
    });
    fireEvent.click(within(table).getByText("http.request.failed"));

    await waitFor(() => assert.ok(view.getByText("Detalle del log")));
    await waitFor(() => assert.ok(view.getByText("Request failed with status 500")));
    await waitFor(() => assert.ok(view.getByRole("button", { name: "Copiar request ID" })));
    assert.ok(view.getByRole("button", { name: "Copiar info técnica" }));
  });

  it("hides page when UI flag is disabled", async () => {
    mockViewport("desktop");
    systemLogsUiEnabled = false;
    const view = renderSystemLogsPage();
    assert.ok(view.getByText("Los logs del sistema no están habilitados en este entorno."));
    assert.equal(view.queryByLabelText("Logs del sistema"), null);
  });
});
