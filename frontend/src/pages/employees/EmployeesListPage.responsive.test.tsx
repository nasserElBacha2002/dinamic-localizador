/**
 * Responsive page tests: mock APIs before importing pages/helpers that pull hooks.
 * Node's mock.module must run before the module graph loads the real API modules.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule("api/employees.api", {
  getEmployees: async () => ({
    data: [
      {
        id: "emp-1",
        name: "Ada Lovelace",
        documentNumber: "30111222",
        phoneNumber: "+5491112345678",
        employeeType: "INTERNAL",
        active: true,
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Operaciones", isSystem: false, isActive: true },
        lastWorkedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
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

mockApiModule("api/employee-categories.api", {
  getEmployeeCategories: async () => [
    { id: "cat-1", name: "Operaciones", isSystem: false, isActive: true },
  ],
  createEmployeeCategory: async () => {
    throw new Error("not used");
  },
  updateEmployeeCategory: async () => {
    throw new Error("not used");
  },
});

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

let renderPage: typeof import("../../test/render-page").renderPage;
let EmployeesListPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ EmployeesListPage } = await import("./EmployeesListPage"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("EmployeesListPage responsive (real page)", () => {
  it("shows desktop table and not mobile cards", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/employees" element={<EmployeesListPage />} />
      </Routes>,
      { route: "/employees" },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Ada Lovelace"));
    });
    assert.ok(view.getByRole("table"));
    assert.equal(view.queryByRole("list", { name: /colaboradores/i }), null);
  });

  it("shows mobile cards, search, filter drawer, and actions without desktop table", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/employees" element={<EmployeesListPage />} />
        <Route path="/employees/new" element={<div>Nuevo</div>} />
      </Routes>,
      { route: "/employees" },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Ada Lovelace"));
    });
    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("list"));
    assert.ok(view.getByLabelText(/Buscar/i));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("combobox", { name: "Estado" }));
    });
    fireEvent.click(within(document.body).getByRole("button", { name: "Listo" }));

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /Más acciones de colaboradores/i }));
    });
    fireEvent.click(view.getByRole("button", { name: /Más acciones de colaboradores/i }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("menuitem", { name: /Importar/i }));
    });
  });
});
