/**
 * Detail page: same structure for viewer and manager; permissions only gate Editar.
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

let membershipPermissions = ["employees:read"];
let absenceBalances: Array<Record<string, unknown>> = [];

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

mockApiModule(
  "api/absences.api",
  {
    getEmployeeAbsenceBalances: async () => absenceBalances,
    getAbsenceRequests: async () => ({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    }),
  },
  ABSENCES_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes, useLocation } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let EmployeeDetailPage: React.ComponentType;
let EmployeeEditPage: React.ComponentType;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe" data-pathname={location.pathname} />;
}

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ EmployeeDetailPage } = await import("./EmployeeDetailPage"));
  ({ EmployeeEditPage } = await import("./EmployeeEditPage"));
});

beforeEach(() => {
  membershipPermissions = ["employees:read"];
  absenceBalances = [];
});

afterEach(() => {
  cleanup();
});

describe("EmployeeDetailPage", () => {
  it("viewer sees cards without Editar or inputs", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/employees/:id" element={<EmployeeDetailPage />} />
      </Routes>,
      { route: "/employees/emp-1" },
    );

    await waitFor(() => {
      assert.ok(view.getAllByText("Ana López").length >= 1);
    });
    assert.ok(view.getByText("Información general"));
    assert.ok(view.getByText(/Detalle de colaborador/i));
    assert.equal(view.queryByRole("button", { name: /^Editar$/i }), null);
    assert.equal(view.queryByRole("button", { name: /Guardar cambios/i }), null);
    assert.equal(view.queryByRole("button", { name: /Ajustar/i }), null);
    assert.equal(view.queryByRole("textbox"), null);
    assert.equal(view.queryByRole("switch"), null);
  });

  it("manager with employees:manage but without absences:balance:update cannot edit balance", async () => {
    membershipPermissions = ["employees:manage", "employees:read"];
    absenceBalances = [
      {
        absenceType: {
          id: "type-1",
          code: "VACATION",
          name: "Vacaciones",
          deductsBalance: true,
        },
        year: new Date().getFullYear(),
        assignedDays: 10,
        approvedDays: 0,
        pendingDays: 0,
        rejectedDays: 0,
        cancelledDays: 0,
        availableDays: 10,
        projectedAvailableDays: 10,
        notes: null,
      },
    ];
    const view = renderPage(
      <Routes>
        <Route path="/employees/:id" element={<EmployeeDetailPage />} />
      </Routes>,
      { route: "/employees/emp-1" },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("link", { name: /^Editar$/i }));
    });
    await waitFor(() => {
      assert.ok(view.getByText("Vacaciones"));
    });
    assert.equal(view.queryByRole("button", { name: /Ajustar/i }), null);
  });

  it("user with absences:balance:update can see Ajustar", async () => {
    membershipPermissions = ["employees:read", "absences:balance:update", "absences:read"];
    absenceBalances = [
      {
        absenceType: {
          id: "type-1",
          code: "VACATION",
          name: "Vacaciones",
          deductsBalance: true,
        },
        year: new Date().getFullYear(),
        assignedDays: 10,
        approvedDays: 0,
        pendingDays: 0,
        rejectedDays: 0,
        cancelledDays: 0,
        availableDays: 10,
        projectedAvailableDays: 10,
        notes: null,
      },
    ];
    const view = renderPage(
      <Routes>
        <Route path="/employees/:id" element={<EmployeeDetailPage />} />
      </Routes>,
      { route: "/employees/emp-1" },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /Ajustar/i }));
    });
  });

  it("manager sees the same cards plus Editar, without form inputs", async () => {
    membershipPermissions = ["employees:manage", "employees:read"];
    const view = renderPage(
      <Routes>
        <Route
          path="/employees/:id"
          element={
            <>
              <EmployeeDetailPage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/employees/:id/edit"
          element={
            <>
              <div>EMPLOYEE_EDIT_TARGET</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      { route: "/employees/emp-1" },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("link", { name: /^Editar$/i }));
    });
    assert.ok(view.getByText("Información general"));
    assert.equal(view.queryByRole("textbox"), null);
    assert.equal(view.queryByRole("button", { name: /Guardar cambios/i }), null);

    fireEvent.click(view.getByRole("link", { name: /^Editar$/i }));
    await waitFor(() => {
      assert.ok(view.getByText("EMPLOYEE_EDIT_TARGET"));
    });
    assert.equal(view.getByTestId("location-probe").getAttribute("data-pathname"), "/employees/emp-1/edit");
  });

  it("manager on /edit sees EmployeeForm", async () => {
    membershipPermissions = ["employees:manage", "employees:read", "absences:read"];
    const view = renderPage(
      <Routes>
        <Route path="/employees/:id/edit" element={<EmployeeEditPage />} />
      </Routes>,
      { route: "/employees/emp-1/edit" },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /Guardar cambios/i }));
    });
    assert.ok(view.getByRole("textbox", { name: /Nombre/i }));
  });
});
