/**
 * Phase 1: read-only users must not see an editable employee form on /:id.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const employee = {
  id: "emp-1",
  name: "Ana López",
  documentNumber: "30111222",
  phoneNumber: "+5491112345678",
  employeeType: "INTERNAL",
  categoryId: null,
  category: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

mockApiModule(
  "api/employees.api",
  {
    getEmployeeById: async () => employee,
  },
  [
    "getEmployees",
    "getEmployeeById",
    "getEmployeeDeactivationImpact",
    "createEmployee",
    "updateEmployee",
    "deactivateEmployee",
  ],
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "VIEWER",
    isPlatformAdmin: false,
    permissions: ["employees:read"],
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

mockApiModule(
  "api/absences.api",
  {
    getEmployeeAbsenceBalances: async () => [],
    getAbsenceRequests: async () => ({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    }),
  },
  ABSENCES_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let EmployeeEditPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ EmployeeEditPage } = await import("./EmployeeEditPage"));
});

afterEach(() => {
  cleanup();
});

describe("EmployeeEditPage read-only gate", () => {
  it("hides Guardar cambios for read-only users on /:id", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/employees/:id" element={<EmployeeEditPage />} />
      </Routes>,
      { route: "/employees/emp-1" },
    );

    await waitFor(() => {
      assert.ok(view.getAllByText("Ana López").length >= 1);
    });
    assert.equal(view.queryByRole("button", { name: /Guardar cambios/i }), null);
    assert.ok(view.getByText("Información general"));
    assert.ok(view.getByText(/Consulta de colaborador/i));
  });
});
