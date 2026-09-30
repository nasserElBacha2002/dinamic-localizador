/**
 * Smoke: AttendanceListPage status chips expose full labels via tooltip.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ATTENDANCE_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const expectedRow = {
  id: "ew-1",
  operationId: "op-1",
  employeeId: "emp-1",
  employeeWorkdayId: "ew-1",
  listRowKey: "ew:ew-1",
  hasAttendanceRecord: false,
  effectiveState: "EXPECTED",
  receivedLatitude: null,
  receivedLongitude: null,
  distanceMeters: null,
  validationStatus: null,
  locationStatus: "NOT_RECORDED",
  punctualityStatus: "NOT_RECORDED",
  sourceMessageSid: null,
  validationReason: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  receivedAt: null,
  checkoutAt: null,
  checkoutLatitude: null,
  checkoutLongitude: null,
  checkoutDistanceMeters: null,
  checkoutStatus: null,
  checkoutReviewReason: null,
  earlyDepartureMinutes: null,
  extraWorkedMinutes: null,
  checkoutMessageSid: null,
  arrivalSource: null,
  checkoutSource: null,
  arrivalRegisteredBy: null,
  arrivalRegisteredAt: null,
  checkoutRegisteredBy: null,
  checkoutRegisteredAt: null,
  isSimulation: false,
  simulationSessionId: null,
  createdAt: "2026-09-30T11:00:00.000Z",
  employee: { id: "emp-1", name: "Ana Esperada", phoneNumber: "+1" },
  operation: {
    id: "op-1",
    status: "SCHEDULED",
    scheduledStart: "2026-11-27T14:00:00.000Z",
    scheduledEnd: "2026-11-27T22:00:00.000Z",
  },
  service: { id: "s-1", name: "Servicio A", address: null, active: true },
};

mockApiModule(
  "api/attendance.api",
  {
    getAttendanceRecords: async () => ({
      data: [expectedRow],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    }),
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
    permissions: ["attendance:read", "attendance:export"],
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
  getEmployeeLookups: async () => [],
  getServiceLookups: async () => [],
  getOperationLookups: async () => [],
});

mockApiModule("api/operation-shifts.api", {
  listOperationShifts: async () => [],
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
  mockViewport("desktop");
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("AttendanceListPage status badges", () => {
  it("shows full validation label via tooltip for expected no-punch rows", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/attendance" element={<AttendanceListPage />} />
      </Routes>,
      { initialEntries: ["/attendance"] },
    );

    const labels = await waitFor(() => {
      const found = view.getAllByText("Pendiente / esperada");
      assert.ok(found.length >= 1);
      return found;
    });
    const focusTarget = labels[0].closest("[tabindex]") as HTMLElement | null;
    assert.ok(focusTarget);
    fireEvent.mouseEnter(focusTarget);

    await waitFor(() => {
      assert.ok(view.getByRole("tooltip", { name: "Pendiente / esperada" }));
    });

    assert.ok(view.getAllByText("Sin registrar").length >= 1);
  });
});
