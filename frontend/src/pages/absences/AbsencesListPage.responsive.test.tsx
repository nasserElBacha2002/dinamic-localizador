import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule(
  "api/absences.api",
  {
    getAbsenceTypes: async () => [
      {
        id: "type-1",
        code: "VACATION",
        name: "Vacaciones",
        deductsBalance: true,
        isActive: true,
      },
    ],
    getAbsenceRequests: async () => ({
      data: [
        {
          id: "abs-1",
          employeeId: "emp-1",
          absenceTypeId: "type-1",
          startDate: "2026-08-01",
          endDate: "2026-08-05",
          totalDays: 5,
          status: "PENDING",
          reason: "Viaje",
          requestedVia: "WHATSAPP",
          createdAt: "2026-07-20T12:00:00.000Z",
          affectedOperationsCount: 1,
          employee: {
            id: "emp-1",
            name: "Ada Lovelace",
            phoneNumber: "+5491112345678",
          },
          absenceType: {
            id: "type-1",
            code: "VACATION",
            name: "Vacaciones",
          },
        },
      ],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    }),
  },
  ABSENCES_API_EXPORTS,
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["absences:read", "absences:review"],
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

mockApiModule("api/employees.api", {
  getEmployees: async () => ({
    data: [],
    meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
  }),
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

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let AbsencesListPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ AbsencesListPage } = await import("./AbsencesListPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("AbsencesListPage responsive (real page)", () => {
  it("shows desktop table", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/absences" element={<AbsencesListPage />} />
      </Routes>,
      { route: "/absences" },
    );

    await waitFor(() => assert.ok(view.getByText("Ada Lovelace")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile cards and filter drawer", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/absences" element={<AbsencesListPage />} />
      </Routes>,
      { route: "/absences" },
    );

    await waitFor(() => assert.ok(view.getByText("Ada Lovelace")));
    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("list"));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("combobox", { name: "Estado" }));
    });
  });
});
