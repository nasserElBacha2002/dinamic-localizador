/**
 * Inactive historical zone: edit other fields while re-sending locationZoneId must succeed
 * (backend invariant; frontend keeps sending the field).
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS, EMPLOYEES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const inactiveZoneId = "11111111-1111-4111-8111-111111111111";

const employee = {
  id: "emp-1",
  name: "Ana López",
  documentNumber: "30111222",
  phoneNumber: "+5491112345678",
  employeeType: "fijo",
  categoryId: null,
  category: null,
  locationZoneId: inactiveZoneId,
  locationZone: {
    id: inactiveZoneId,
    name: "Caballito",
    locality: "CABA",
    isActive: false,
  },
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let lastUpdatePayload: Record<string, unknown> | null = null;
let updateCalls = 0;

mockApiModule(
  "api/employees.api",
  {
    getEmployeeById: async () => employee,
    updateEmployee: async (_id: string, input: Record<string, unknown>) => {
      updateCalls += 1;
      lastUpdatePayload = input;
      return { ...employee, ...input, name: String(input.name ?? employee.name) };
    },
  },
  EMPLOYEES_API_EXPORTS,
);

mockApiModule("api/employee-categories.api", {
  getEmployeeCategories: async () => [],
  createEmployeeCategory: async () => {
    throw new Error("not used");
  },
  updateEmployeeCategory: async () => {
    throw new Error("not used");
  },
});

mockApiModule("api/location-zones.api", {
  getLocationZones: async () => [],
  createLocationZone: async () => {
    throw new Error("not used");
  },
  updateLocationZone: async () => {
    throw new Error("not used");
  },
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["employees:manage", "employees:read", "absences:read", "company:settings:update"],
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
import userEvent from "@testing-library/user-event";
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
  lastUpdatePayload = null;
  updateCalls = 0;
});

describe("EmployeeEditPage inactive location zone", () => {
  it("submits successfully while re-sending inactive historical locationZoneId", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(
      <Routes>
        <Route path="/employees/:id/edit" element={<EmployeeEditPage />} />
        <Route path="/employees/:id" element={<div>DETAIL</div>} />
      </Routes>,
      { initialEntries: ["/employees/emp-1/edit"] },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /Guardar cambios/i }));
      assert.ok(view.getByRole("textbox", { name: /Nombre/i }));
    });

    const nameInput = view.getByRole("textbox", { name: /Nombre/i });
    await user.tripleClick(nameInput);
    await user.keyboard("Ana Editada");
    await user.click(view.getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() => {
      assert.equal(updateCalls, 1);
    });
    assert.equal(lastUpdatePayload?.locationZoneId, inactiveZoneId);
    assert.equal(lastUpdatePayload?.name, "Ana Editada");
  });
});
