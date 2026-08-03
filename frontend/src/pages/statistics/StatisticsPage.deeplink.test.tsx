/**
 * Deep-link integration: StatisticsPage must pass employeeIds to every relevant query.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, EMPLOYEES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

const emptyPage = {
  data: [],
  meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0, total: 0, limit: 10 },
};

const summaryCalls: Array<Record<string, unknown>> = [];
const timelineCalls: Array<Record<string, unknown>> = [];
const distributionCalls: Array<Record<string, unknown>> = [];
const byEmployeeCalls: Array<Record<string, unknown>> = [];
const byOperationCalls: Array<Record<string, unknown>> = [];
const byServiceCalls: Array<Record<string, unknown>> = [];

mockApiModule("api/statistics.api", {
  getAttendanceStatisticsSummary: async (filters: Record<string, unknown>) => {
    summaryCalls.push(filters);
    return {
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
      incompleteCoverageOperations: 0,
      coverageRate: 0,
      hoursDataIncomplete: false,
      previousPeriod: null,
      comparison: null,
      minSampleWorkdays: 3,
    };
  },
  getAttendanceStatisticsTimeline: async (filters: Record<string, unknown>) => {
    timelineCalls.push(filters);
    return [];
  },
  getAttendanceActionExceptions: async (filters: Record<string, unknown>) => {
    distributionCalls.push(filters);
    return [];
  },
  getAttendanceStatusDistribution: async (filters: Record<string, unknown>) => {
    distributionCalls.push(filters);
    return [];
  },
  getAttendanceByEmployee: async (filters: Record<string, unknown>) => {
    byEmployeeCalls.push(filters);
    return emptyPage;
  },
  getAttendanceByOperation: async (filters: Record<string, unknown>) => {
    byOperationCalls.push(filters);
    return emptyPage;
  },
  getAttendanceByService: async (filters: Record<string, unknown>) => {
    byServiceCalls.push(filters);
    return emptyPage;
  },
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
}, EMPLOYEES_API_EXPORTS);

mockApiModule("api/company-modules.api", {
  getCompanyModules: async () => [
    {
      companyId: "co-1",
      moduleKey: "reports",
      isEnabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  updateCompanyModules: async () => [],
});

mockApiModule("api/lookups.api", {
  getEmployeeLookups: async (params: { ids?: string[] }) => {
    if (params.ids?.includes(EMPLOYEE_ID)) {
      return [
        {
          id: EMPLOYEE_ID,
          fullName: "Ada Lovelace",
        },
      ];
    }
    return [];
  },
  getServiceLookups: async () => [],
  getOperationLookups: async () => [],
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let StatisticsPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ StatisticsPage } = await import("./StatisticsPage"));
});

beforeEach(() => {
  summaryCalls.length = 0;
  timelineCalls.length = 0;
  distributionCalls.length = 0;
  byEmployeeCalls.length = 0;
  byOperationCalls.length = 0;
  byServiceCalls.length = 0;
  mockViewport("desktop");
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

function assertAllCallsIncludeEmployee(calls: Array<Record<string, unknown>>) {
  assert.ok(calls.length >= 1, "expected at least one API call");
  for (const call of calls) {
    assert.deepEqual(call.employeeIds, [EMPLOYEE_ID]);
  }
}

describe("StatisticsPage employee deep-link", () => {
  it("applies employeeIds to employee-tab queries and opens employee tab", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/statistics" element={<StatisticsPage />} />
      </Routes>,
      { route: `/statistics?employeeIds=${EMPLOYEE_ID}&tab=employee` },
    );

    await waitFor(() => {
      assert.ok(byEmployeeCalls.length >= 1);
    });

    // Lazy tabs: employee tab must not preload general charts or other tables.
    assert.equal(summaryCalls.length, 0);
    assert.equal(timelineCalls.length, 0);
    assert.equal(distributionCalls.length, 0);
    assert.equal(byOperationCalls.length, 0);
    assert.equal(byServiceCalls.length, 0);

    assertAllCallsIncludeEmployee(byEmployeeCalls);

    await waitFor(() => {
      assert.ok(view.getByText("Ada Lovelace"));
      assert.equal(
        (view.getByRole("tab", { name: "Por empleado" }) as HTMLButtonElement).getAttribute(
          "aria-selected",
        ),
        "true",
      );
    });
  });

  it("removes employeeIds from subsequent queries after Limpiar filtros while keeping tab", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/statistics" element={<StatisticsPage />} />
      </Routes>,
      { route: `/statistics?employeeIds=${EMPLOYEE_ID}&tab=employee` },
    );

    await waitFor(() => assert.ok(byEmployeeCalls.length >= 1));

    const clearButton = await waitFor(
      () => view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement,
    );
    const beforeClear = byEmployeeCalls.length;
    fireEvent.click(clearButton);

    await waitFor(() => {
      const after = byEmployeeCalls.slice(beforeClear);
      assert.ok(after.length >= 1);
      assert.ok(after.every((call) => call.employeeIds === undefined));
    });

    assert.equal(
      (view.getByRole("tab", { name: "Por empleado" }) as HTMLButtonElement).getAttribute(
        "aria-selected",
      ),
      "true",
    );
  });
});
