import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule("api/bot-simulator.api", {
  createBotSimulationSession: async () => {
    throw new Error("not used");
  },
  getBotSimulationSession: async () => {
    throw new Error("not used");
  },
  restartBotSimulationSession: async () => {
    throw new Error("not used");
  },
  sendBotSimulationMessage: async () => {
    throw new Error("not used");
  },
  sendBotSimulationLocation: async () => {
    throw new Error("not used");
  },
  getBotSimulationLocationPresets: async () => {
    throw new Error("not used");
  },
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["bot_simulator:use"],
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
  getCompanyModules: async () => [{ key: "bot_simulator", enabled: true }],
  updateCompanyModules: async () => [],
});

mockApiModule("api/employees.api", {
  getEmployees: async () => ({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
  getEmployeeById: async () => {
    throw new Error("not used");
  },
  getEmployeeDeactivationImpact: async () => {
    throw new Error("not used");
  },
  createEmployee: async () => {
    throw new Error("not used");
  },
  updateEmployee: async () => {
    throw new Error("not used");
  },
  deactivateEmployee: async () => {
    throw new Error("not used");
  },
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
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let BotSimulatorPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ BotSimulatorPage } = await import("./BotSimulatorPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("BotSimulatorPage responsive (real page)", () => {
  it("renders setup layout on desktop", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/bot-simulator" element={<BotSimulatorPage />} />
      </Routes>,
      { route: "/bot-simulator" },
    );

    await waitFor(() => assert.ok(view.getByText("Simulador de Bot")));
  });

  it("renders single-column setup on mobile", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/bot-simulator" element={<BotSimulatorPage />} />
      </Routes>,
      { route: "/bot-simulator" },
    );

    await waitFor(() => assert.ok(view.getByText("Simulador de Bot")));
    assert.ok(view.getByText(/Probá flujos de WhatsApp/i));
  });
});
