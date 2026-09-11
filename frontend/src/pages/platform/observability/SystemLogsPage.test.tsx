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
import type {
  SystemRuntimeLogDetail,
  SystemRuntimeLogSummaryRow,
} from "../../../types/system-logs";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const sampleSummary: SystemRuntimeLogSummaryRow = {
  id: "11111111-1111-1111-1111-111111111111",
  occurredAt: "2026-08-01T10:00:00.000Z",
  level: "error",
  service: "dinamic-backend",
  module: "http",
  event: "http.request.failed",
  message: "Request failed with status 500",
  errorCode: "INTERNAL_ERROR",
  companyId: "co-1",
  requestId: "req-1234567890abcdef",
  correlationId: "corr-abcdef1234567890",
  jobExecutionId: null,
};

const sampleDetail: SystemRuntimeLogDetail = {
  ...sampleSummary,
  schemaVersion: 1,
  serviceInstanceId: "instance-1",
  environment: "test",
  operationId: null,
  employeeId: null,
  conversationId: null,
  metadata: { path: "/api/health" },
  errorName: "Error",
  errorMessage: "boom",
  errorStack: "Error: boom\n    at handler",
  createdAt: "2026-08-01T10:00:01.000Z",
};

let listData: SystemRuntimeLogSummaryRow[] = [sampleSummary];

mockApiModule(
  "api/system-logs.api",
  {
    getSystemLogs: async () => ({
      data: listData,
      meta: {
        page: 1,
        limit: 20,
        total: listData.length,
        totalPages: listData.length > 0 ? 1 : 0,
      },
    }),
    getSystemLogById: async () => sampleDetail,
    getSystemLogContext: async () => ({
      data: [sampleSummary],
      meta: { correlationKey: "requestId" as const },
    }),
    getSystemLogsOptions: async () => ({
      levels: ["error", "warn", "info"],
      modules: ["http"],
      events: ["http.request.failed"],
      infoEventAllowlist: ["system-log-retention.completed"],
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
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../../test/render-page").clearActiveTestQueryClients;
let SystemLogsPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../../test/render-page"));
  ({ SystemLogsPage } = await import("./SystemLogsPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  systemLogsUiEnabled = true;
  listData = [sampleSummary];
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
  it("renders summary table for platform admin without stack fields in list payload", async () => {
    const view = renderSystemLogsPage();
    await waitFor(() => assert.ok(view.getByText("Logs del sistema")));
    await waitFor(() => assert.ok(view.getAllByText("http.request.failed").length >= 1));
    assert.equal(Object.prototype.hasOwnProperty.call(listData[0], "errorStack"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(listData[0], "metadata"), false);
  });

  it("denies access for non-platform admin", () => {
    const view = renderSystemLogsPage(regularAuth);
    assert.ok(
      view.getByText(
        "Solo un superadministrador de plataforma puede acceder a los logs del sistema.",
      ),
    );
  });

  it("hides page when UI flag is disabled", () => {
    systemLogsUiEnabled = false;
    const view = renderSystemLogsPage();
    assert.ok(view.getByText("Los logs del sistema no están habilitados en este entorno."));
  });
});
