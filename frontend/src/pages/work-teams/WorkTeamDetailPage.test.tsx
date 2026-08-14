/**
 * Detail page: cards + members + history; admin actions only with manage.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, WORK_TEAMS_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const workTeam = {
  id: "wt-1",
  companyId: "co-1",
  name: "Equipo Mañana",
  description: "Turno AM",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  memberCount: 1,
  activeMemberCount: 1,
  members: [
    {
      workTeamId: "wt-1",
      employeeId: "emp-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      employee: {
        id: "emp-1",
        name: "Ana López",
        documentNumber: "30111222",
        phoneNumber: "+5491112345678",
        employeeType: "INTERNAL",
        categoryId: null,
        category: null,
        locationZoneId: null,
        locationZone: null,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  ],
};

mockApiModule(
  "api/work-teams.api",
  {
    getWorkTeamById: async () => workTeam,
    getWorkTeamUsage: async () => ({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    }),
  },
  WORK_TEAMS_API_EXPORTS,
);

let membershipPermissions = ["employees:read"];

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "VIEWER",
    isPlatformAdmin: false,
    permissions: membershipPermissions,
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
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let WorkTeamDetailPage: React.ComponentType;
let WorkTeamEditPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ WorkTeamDetailPage } = await import("./WorkTeamDetailPage"));
  ({ WorkTeamEditPage } = await import("./WorkTeamEditPage"));
});

beforeEach(() => {
  membershipPermissions = ["employees:read"];
});

afterEach(() => {
  cleanup();
});

describe("WorkTeamDetailPage", () => {
  it("viewer sees cards, members and history without admin actions or form", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/work-teams/:id" element={<WorkTeamDetailPage />} />
      </Routes>,
      { route: "/work-teams/wt-1" },
    );

    await waitFor(() => {
      assert.ok(view.getAllByText("Equipo Mañana").length >= 1);
    });
    assert.ok(view.getByText("Información general"));
    assert.ok(view.getByRole("list", { name: /Integrantes del grupo/i }));
    assert.ok(view.getByText("Historial de uso"));
    assert.ok(view.getByText("Ana López"));
    assert.ok(view.getByText("Turno AM"));
    assert.equal(view.queryByRole("button", { name: /^Editar$/i }), null);
    assert.equal(view.queryByRole("link", { name: /^Editar$/i }), null);
    assert.equal(view.queryByRole("button", { name: /Desactivar/i }), null);
    assert.equal(view.queryByText("Datos del grupo"), null);
    assert.equal(view.queryByRole("button", { name: /Guardar cambios/i }), null);
  });

  it("manager sees Editar and Desactivar without WorkTeamForm on detail", async () => {
    membershipPermissions = ["employees:manage", "employees:read"];
    const view = renderPage(
      <Routes>
        <Route path="/work-teams/:id" element={<WorkTeamDetailPage />} />
      </Routes>,
      { route: "/work-teams/wt-1" },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("link", { name: /^Editar$/i }));
    });
    assert.ok(view.getByRole("button", { name: /Desactivar/i }));
    assert.ok(view.getByText("Información general"));
    assert.equal(view.queryByText("Datos del grupo"), null);
    assert.equal(view.queryByRole("button", { name: /Guardar cambios/i }), null);
  });

  it("edit route shows WorkTeamForm", async () => {
    membershipPermissions = ["employees:manage"];
    const view = renderPage(
      <Routes>
        <Route path="/work-teams/:id/edit" element={<WorkTeamEditPage />} />
      </Routes>,
      { route: "/work-teams/wt-1/edit" },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Datos del grupo"));
    });
    assert.ok(view.getByRole("button", { name: /Guardar cambios/i }));
  });
});
