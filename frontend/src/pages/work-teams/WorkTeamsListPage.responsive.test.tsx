import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, WORK_TEAMS_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";

setRuntimeCompanyId("co-1");

mockApiModule(
  "api/work-teams.api",
  {
    getWorkTeams: async () => ({
      data: [
        {
          id: "team-1",
          companyId: "co-1",
          name: "Equipo Norte",
          description: "Turno mañana",
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          memberCount: 4,
          activeMemberCount: 3,
        },
      ],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    }),
  },
  WORK_TEAMS_API_EXPORTS,
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["employees:manage", "employees:read"],
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
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { mockViewport } from "../../test/mock-match-media";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { renderPage } from "../../test/render-page";

installLayoutPolyfills();

let WorkTeamsListPage: React.ComponentType;

before(async () => {
  ({ WorkTeamsListPage } = await import("./WorkTeamsListPage"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("WorkTeamsListPage responsive (real page)", () => {
  it("shows desktop table", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/work-teams" element={<WorkTeamsListPage />} />
      </Routes>,
      { route: "/work-teams" },
    );

    await waitFor(() => assert.ok(view.getByText("Equipo Norte")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile cards with member count and filter drawer", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/work-teams" element={<WorkTeamsListPage />} />
      </Routes>,
      { route: "/work-teams" },
    );

    await waitFor(() => assert.ok(view.getByText("Equipo Norte")));
    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByText("4"));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("combobox", { name: "Estado" }));
    });
  });
});
