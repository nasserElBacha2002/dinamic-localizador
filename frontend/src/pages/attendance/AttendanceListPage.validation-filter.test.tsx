/**
 * Validation status filter: Ausente option and API contract.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ATTENDANCE_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";
import type { AttendanceRecordWithRelations } from "../../types/attendance";
import { attendanceListIsAbsentClassification } from "../../utils/attendance-list-display";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const absentRow: AttendanceRecordWithRelations = {
  id: "ew-absent",
  operationId: "op-1",
  employeeId: "emp-1",
  employeeWorkdayId: "ew-absent",
  listRowKey: "ew:ew-absent",
  hasAttendanceRecord: false,
  effectiveState: "ABSENT",
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
  employee: { id: "emp-1", name: "Bruno Ausente", phoneNumber: "+1" },
  operation: {
    id: "op-1",
    status: "COMPLETED",
    scheduledStart: "2026-09-30T11:00:00.000Z",
    scheduledEnd: "2026-09-30T19:00:00.000Z",
  },
  service: { id: "s-1", name: "Servicio A", address: null, active: true },
};

const attendanceFilterCalls: Array<Record<string, unknown>> = [];

mockApiModule(
  "api/attendance.api",
  {
    getAttendanceRecords: async (filters: Record<string, unknown>) => {
      attendanceFilterCalls.push(filters);
      const rows =
        filters.validationStatus === "ABSENT"
          ? [absentRow]
          : filters.validationStatus
            ? []
            : [absentRow];
      return {
        data: rows,
        meta: { page: 1, pageSize: 10, totalItems: rows.length, totalPages: 1 },
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
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
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

describe("AttendanceListPage validation filter Ausente", () => {
  it("shows Ausente in Estado de validación and queries validationStatus=ABSENT", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/attendance" element={<AttendanceListPage />} />
      </Routes>,
      { route: "/attendance?validationStatus=ABSENT" },
    );

    await waitFor(() => {
      assert.ok(
        attendanceFilterCalls.some((call) => call.validationStatus === "ABSENT"),
      );
    });

    const validationSelect = within(document.body).getByRole("combobox", {
      name: "Estado de validación",
    }) as HTMLInputElement;
    assert.equal(validationSelect.value, "Ausente");

    await waitFor(() => {
      assert.ok(view.getByText("Bruno Ausente"));
      assert.ok(view.getAllByText("Ausente").length >= 1);
    });
    assert.equal(attendanceListIsAbsentClassification(absentRow), true);
  });

  it("clears validationStatus when Limpiar filtros is used", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/attendance" element={<AttendanceListPage />} />
      </Routes>,
      { route: "/attendance?validationStatus=ABSENT" },
    );

    await waitFor(() => {
      assert.ok(attendanceFilterCalls.some((call) => call.validationStatus === "ABSENT"));
    });

    const beforeClear = attendanceFilterCalls.length;
    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => {
      const after = attendanceFilterCalls.slice(beforeClear);
      assert.ok(after.length >= 1);
      assert.ok(after.every((call) => call.validationStatus === undefined));
    });
  });
});
