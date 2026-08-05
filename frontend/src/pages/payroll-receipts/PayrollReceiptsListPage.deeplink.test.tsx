/**
 * Deep-link integration: PayrollReceiptsListPage with employeeIds from URL.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, PAYROLL_RECEIPTS_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const receiptFilterCalls: Array<Record<string, unknown>> = [];

mockApiModule(
  "api/payroll-receipts.api",
  {
    getPayrollReceipts: async (filters: Record<string, unknown>) => {
      receiptFilterCalls.push(filters);
      return {
        data: [],
        meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      };
    },
    createPayrollReceiptBatch: async () => {
      throw new Error("not used");
    },
    getPayrollReceiptBatches: async () => ({
      data: [],
      meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    }),
    getPayrollReceiptBatch: async () => {
      throw new Error("not used");
    },
    uploadPayrollReceiptToBatch: async () => {
      throw new Error("not used");
    },
    getPayrollReceiptById: async () => {
      throw new Error("not used");
    },
    getPayrollReceiptContentUrl: () => "",
    downloadPayrollReceiptContent: async () => {
      throw new Error("not used");
    },
    replacePayrollReceipt: async () => {
      throw new Error("not used");
    },
    deletePayrollReceipt: async () => {
      throw new Error("not used");
    },
    reconcilePayrollReceiptAssociation: async () => {
      throw new Error("not used");
    },
  },
  PAYROLL_RECEIPTS_API_EXPORTS,
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["payroll_receipts:read", "payroll_receipts:upload"],
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
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let PayrollReceiptsListPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ PayrollReceiptsListPage } = await import("./PayrollReceiptsListPage"));
});

beforeEach(() => {
  receiptFilterCalls.length = 0;
  mockViewport("desktop");
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("PayrollReceiptsListPage employee deep-link", () => {
  it("queries with employeeIds from URL", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/payroll-receipts" element={<PayrollReceiptsListPage />} />
      </Routes>,
      { route: `/payroll-receipts?employeeIds=${EMPLOYEE_ID}` },
    );

    await waitFor(() => {
      assert.ok(receiptFilterCalls.length >= 1);
    });

    const first = receiptFilterCalls[0] ?? {};
    assert.deepEqual(first.employeeIds, [EMPLOYEE_ID]);

    await waitFor(() => {
      assert.ok(view.getByText("Ada Lovelace"));
    });
  });
});
