/**
 * Deep-link integration: AbsencesListPage with employeeIds + status=all.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const absenceFilterCalls: Array<Record<string, unknown>> = [];

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
    getAbsenceRequests: async (filters: Record<string, unknown>) => {
      absenceFilterCalls.push(filters);
      return {
        data: [],
        meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      };
    },
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
let AbsencesListPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ AbsencesListPage } = await import("./AbsencesListPage"));
});

beforeEach(() => {
  absenceFilterCalls.length = 0;
  mockViewport("desktop");
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("AbsencesListPage employee deep-link", () => {
  it("queries with employeeIds and without status when status=all", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/absences" element={<AbsencesListPage />} />
      </Routes>,
      { route: `/absences?employeeIds=${EMPLOYEE_ID}&status=all` },
    );

    await waitFor(() => {
      assert.ok(absenceFilterCalls.length >= 1);
    });

    const first = absenceFilterCalls[0] ?? {};
    assert.deepEqual(first.employeeIds, [EMPLOYEE_ID]);
    assert.equal(first.status, undefined);

    await waitFor(() => {
      assert.ok(view.getByText("Ada Lovelace"));
    });
  });

  it("clears employeeIds via Limpiar filtros while leaving the page usable", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/absences" element={<AbsencesListPage />} />
      </Routes>,
      { route: `/absences?employeeIds=${EMPLOYEE_ID}&status=all` },
    );

    await waitFor(() => assert.ok(absenceFilterCalls.length >= 1));

    const clearButton = await waitFor(
      () => view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement,
    );
    const beforeClear = absenceFilterCalls.length;
    fireEvent.click(clearButton);

    await waitFor(() => {
      const after = absenceFilterCalls.slice(beforeClear);
      assert.ok(after.length >= 1);
      assert.ok(after.every((call) => call.employeeIds === undefined));
      // Default status PENDING is re-applied after clear.
      assert.ok(after.some((call) => call.status === "PENDING"));
    });
  });
});
