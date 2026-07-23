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
    permissions: ["users:manage"],
  }),
  getCompanyUsers: async () => ({
    data: [
      {
        userId: "u-1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        companyRole: "ADMIN",
        membershipStatus: "ACTIVE",
        isDefault: true,
        updatedAt: "2026-07-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
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
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let CompanyUsersPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ CompanyUsersPage } = await import("./CompanyUsersPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("CompanyUsersPage responsive (real page)", () => {
  it("shows desktop table", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/settings/users" element={<CompanyUsersPage />} />
      </Routes>,
      { route: "/settings/users" },
    );

    await waitFor(() => assert.ok(view.getByText("Ada Lovelace")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile cards and filter drawer", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/settings/users" element={<CompanyUsersPage />} />
      </Routes>,
      { route: "/settings/users" },
    );

    await waitFor(() => assert.ok(view.getByText("Ada Lovelace")));
    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("button", { name: /^Filtros/ }));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("combobox", { name: "Rol" }));
    });
    fireEvent.click(within(document.body).getByRole("button", { name: "Listo" }));
  });
});
