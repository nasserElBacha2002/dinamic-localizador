/**
 * Absence detail: review actions gated by absences:review.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYEE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const pendingRequest = {
  id: REQUEST_ID,
  employeeId: EMPLOYEE_ID,
  absenceTypeId: "type-1",
  startDate: "2026-08-01",
  endDate: "2026-08-02",
  startPeriod: "FULL_DAY",
  endPeriod: "FULL_DAY",
  totalDays: 2,
  reason: "Vacaciones familiares",
  status: "PENDING",
  requestedVia: "ADMIN",
  sourceMessageSid: null,
  reviewedByUserId: null,
  reviewedAt: null,
  reviewComment: null,
  cancelledAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  employee: {
    id: EMPLOYEE_ID,
    name: "Ada Lovelace",
    phoneNumber: "+5491111111111",
    active: true,
  },
  absenceType: { id: "type-1", code: "VACATION", name: "Vacaciones" },
  affectedOperationsCount: 0,
  events: [],
  affectedOperations: [],
  balanceImpact: {
    deductsBalance: true,
    year: 2026,
    requestDays: 2,
    assignedDays: 10,
    approvedDays: 0,
    pendingDays: 2,
    availableDays: 10,
    availableAfterApproval: 8,
    hasSufficientBalance: true,
  },
};

let membershipPermissions = ["absences:read"];

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
    getAbsenceRequestById: async () => pendingRequest,
    getAbsenceTypes: async () => [
      {
        id: "type-1",
        code: "VACATION",
        name: "Vacaciones",
        deductsBalance: true,
        isActive: true,
        requiresApproval: true,
        requiresAttachment: false,
        allowsHalfDay: false,
        description: null,
      },
    ],
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
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let AbsenceDetailPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ AbsenceDetailPage } = await import("./AbsenceDetailPage"));
});

beforeEach(() => {
  membershipPermissions = ["absences:read"];
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("AbsenceDetailPage permissions", () => {
  it("hides approve/reject/needs-info without absences:review", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Detalle de solicitud de ausencia"));
    });
    assert.equal(view.queryByRole("button", { name: /^Aprobar$/i }), null);
    assert.equal(view.queryByRole("button", { name: /Más acciones/i }), null);
    assert.ok(view.getByRole("button", { name: /Volver al listado/i }));
  });

  it("shows approve when user has absences:review", async () => {
    membershipPermissions = ["absences:read", "absences:review"];
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /^Aprobar$/i }));
    });
    assert.ok(view.getByRole("button", { name: /Más acciones/i }));
  });
});
