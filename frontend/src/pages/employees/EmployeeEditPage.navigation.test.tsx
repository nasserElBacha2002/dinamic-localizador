/**
 * Phase 1: edit ↔ detail navigation preserves list context (location.state).
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS, EMPLOYEES_API_EXPORTS } from "../../test/mock-api-module";
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
  locationZoneId: null,
  locationZone: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

mockApiModule(
  "api/employees.api",
  {
    getEmployeeById: async () => employee,
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
    permissions: ["employees:manage", "employees:read", "absences:read"],
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
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes, useLocation } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let EmployeeEditPage: React.ComponentType;

function LocationProbe() {
  const location = useLocation();
  return (
    <div
      data-testid="location-probe"
      data-pathname={location.pathname}
      data-state={JSON.stringify(location.state)}
    />
  );
}

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ EmployeeEditPage } = await import("./EmployeeEditPage"));
});

afterEach(() => {
  cleanup();
});

const listState = { fromList: true, page: 2, search: "ana" };

describe("EmployeeEditPage navigation context", () => {
  it("Cancelar on /edit returns to detail with preserved location.state", async () => {
    const view = renderPage(
      <Routes>
        <Route
          path="/employees/:id/edit"
          element={
            <>
              <EmployeeEditPage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <>
              <div>DETAIL_PAGE</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      {
        initialEntries: [{ pathname: "/employees/emp-1/edit", state: listState }],
      },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /Guardar cambios/i }));
    });

    fireEvent.click(view.getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => {
      assert.ok(view.getByText("DETAIL_PAGE"));
    });

    const probe = view.getByTestId("location-probe");
    assert.equal(probe.getAttribute("data-pathname"), "/employees/emp-1");
    assert.equal(probe.getAttribute("data-state"), JSON.stringify(listState));
  });
});
