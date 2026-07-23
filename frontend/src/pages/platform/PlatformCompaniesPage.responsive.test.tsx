import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule("api/platform-companies.api", {
  getPlatformCompanies: async () => [
    {
      id: "co-1",
      name: "Dinamic Demo",
      status: "ACTIVE",
      defaultTimezone: "America/Argentina/Buenos_Aires",
    },
  ],
  createPlatformCompany: async () => {
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

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let PlatformCompaniesPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ PlatformCompaniesPage } = await import("./PlatformCompaniesPage"));
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

describe("PlatformCompaniesPage responsive (real page)", () => {
  it("shows desktop table", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/platform/companies" element={<PlatformCompaniesPage />} />
      </Routes>,
      { route: "/platform/companies", auth: platformAuth },
    );

    await waitFor(() => assert.ok(view.getByText("Dinamic Demo")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile cards", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/platform/companies" element={<PlatformCompaniesPage />} />
      </Routes>,
      { route: "/platform/companies", auth: platformAuth },
    );

    await waitFor(() => assert.ok(view.getByText("Dinamic Demo")));
    assert.equal(view.queryByRole("table"), null);
  });
});
