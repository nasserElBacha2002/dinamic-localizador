import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const emptyPage = {
  data: [],
  meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, total: 0, limit: 10 },
};

mockApiModule("api/statistics.api", {
  getAttendanceStatisticsSummary: async () => ({
    scheduledWorkdays: 0,
    attendanceRequiredWorkdays: 0,
    presentWorkdays: 0,
    absentWorkdays: 0,
    justifiedWorkdays: 0,
    expectedOpenWorkdays: 0,
    cancelledWorkdays: 0,
    attendanceRate: 0,
    absenceRate: 0,
    onTimeWorkdays: 0,
    lateWorkdays: 0,
    punctualityRate: 0,
    earlyDepartureWorkdays: 0,
    workedMinutes: 0,
    overtimeMinutes: 0,
    openAttendanceWorkdays: 0,
    outsideGeofenceCount: 0,
    pendingReviewCount: 0,
    rejectedCount: 0,
    manuallyAcceptedCount: 0,
    totalOperations: 0,
  }),
  getAttendanceStatisticsTimeline: async () => [],
  getAttendanceStatusDistribution: async () => [],
  getAttendanceByEmployee: async () => emptyPage,
  getAttendanceByOperation: async () => emptyPage,
  getAttendanceByService: async () => emptyPage,
  getAttendanceWorkdayDetails: async () => emptyPage,
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["reports:read", "attendance:read"],
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
  getEmployees: async () => ({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
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

mockApiModule("api/operations.api", {
  getOperations: async () => ({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
}, [
  "getOperations",
  "getOperationById",
  "createOperation",
  "updateOperation",
  "cancelOperation",
  "reactivateOperation",
  "getOperationEmployees",
  "assignEmployeeToOperation",
  "cancelOperationAssignment",
  "unassignEmployeeFromOperation",
  "endOperationAssignment",
  "getOperationAttendanceSummary",
  "getOperationWorkdays",
  "getOperationWorkdayDetail",
  "materializeOperationWorkdays",
  "previewOperationImport",
  "confirmOperationImport",
]);

mockApiModule("api/services.api", {
  getServices: async () => ({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
  getServiceFacets: async () => ({
    localities: [],
    neighborhoodsByLocality: {},
  }),
  getServiceById: async () => {
    throw new Error("not used");
  },
  createService: async () => {
    throw new Error("not used");
  },
  updateService: async () => {
    throw new Error("not used");
  },
  deactivateService: async () => {
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
let StatisticsPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ StatisticsPage } = await import("./StatisticsPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("StatisticsPage responsive (real page)", () => {
  it("shows filters and tabs on desktop", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/statistics" element={<StatisticsPage />} />
      </Routes>,
      { route: "/statistics" },
    );

    await waitFor(() => assert.ok(view.getByText("Estadísticas")));
    assert.ok(view.getByRole("tab", { name: "General" }));
    assert.ok(view.getByRole("tab", { name: "Por empleado" }));
  });

  it("opens filter drawer on mobile", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/statistics" element={<StatisticsPage />} />
      </Routes>,
      { route: "/statistics" },
    );

    await waitFor(() => assert.ok(view.getByText("Estadísticas")));
    const filtersButton = view.getByRole("button", { name: /^Filtros/ });
    fireEvent.click(filtersButton);
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("button", { name: "Listo" }));
    });
    fireEvent.click(within(document.body).getByRole("button", { name: "Listo" }));
  });
});
