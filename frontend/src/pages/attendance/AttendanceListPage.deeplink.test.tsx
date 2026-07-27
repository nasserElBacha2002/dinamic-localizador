/**
 * Deep-link integration: AttendanceListPage must query with employeeIds from the URL.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ATTENDANCE_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

const attendanceFilterCalls: Array<Record<string, unknown>> = [];

mockApiModule(
  "api/attendance.api",
  {
    getAttendanceRecords: async (filters: Record<string, unknown>) => {
      attendanceFilterCalls.push(filters);
      return {
        data: [],
        meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      };
    },
    exportAttendanceCsv: async () => new Blob(["csv"]),
  },
  ATTENDANCE_API_EXPORTS,
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["attendance:read", "attendance:export", "attendance:review"],
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

mockApiModule("api/company-modules.api", {
  getCompanyModules: async () => [],
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
let AttendanceListPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ AttendanceListPage } = await import("./AttendanceListPage"));
});

beforeEach(() => {
  attendanceFilterCalls.length = 0;
  mockViewport("desktop");
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("AttendanceListPage employee deep-link", () => {
  it("queries with employeeIds from the URL and resolves the selector label", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/attendance" element={<AttendanceListPage />} />
      </Routes>,
      { route: `/attendance?employeeIds=${EMPLOYEE_ID}` },
    );

    await waitFor(() => {
      assert.ok(attendanceFilterCalls.length >= 1);
    });

    const first = attendanceFilterCalls[0] ?? {};
    assert.deepEqual(first.employeeIds, [EMPLOYEE_ID]);

    await waitFor(() => {
      assert.ok(view.getByText("Ada Lovelace"));
    });
  });

  it("keeps employeeIds when another filter changes, then clears it via Limpiar filtros", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/attendance" element={<AttendanceListPage />} />
      </Routes>,
      { route: `/attendance?employeeIds=${EMPLOYEE_ID}&validationStatus=VALID` },
    );

    await waitFor(() => {
      assert.ok(
        attendanceFilterCalls.some(
          (call) =>
            Array.isArray(call.employeeIds) &&
            (call.employeeIds as string[]).includes(EMPLOYEE_ID) &&
            call.validationStatus === "VALID",
        ),
      );
    });

    const clearButton = await waitFor(
      () => view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement,
    );
    assert.equal(clearButton.disabled, false);
    const beforeClear = attendanceFilterCalls.length;
    fireEvent.click(clearButton);

    await waitFor(() => {
      const after = attendanceFilterCalls.slice(beforeClear);
      assert.ok(after.length >= 1);
      assert.ok(after.every((call) => call.employeeIds === undefined));
    });
  });
});
