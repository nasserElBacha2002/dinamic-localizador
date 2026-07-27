/**
 * Detail header identity: operation display name + avatar consistent with list.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, OPERATIONS_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const operationDetail = {
  id: "op-1",
  serviceId: "svc-1",
  operationKind: "ONE_TIME",
  scheduledStart: "2026-07-25T12:00:00.000Z",
  scheduledEnd: "2026-07-25T18:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 10,
  status: "SCHEDULED",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  service: {
    id: "svc-1",
    name: "Sucursal Centro",
    address: "Av. Corrientes 1234",
    neighborhood: null,
    locality: null,
    serviceFormat: null,
    latitude: -34.6,
    longitude: -58.4,
    allowedRadiusMeters: 150,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  assignedEmployees: [],
  attendanceRecordsCount: 0,
};

mockApiModule(
  "api/operations.api",
  {
    getOperationById: async () => operationDetail,
    getOperationWorkdays: async () => [],
    getOperationEmployees: async () => [],
  },
  OPERATIONS_API_EXPORTS,
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["operations:manage", "operations:read"],
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

mockApiModule("api/company-settings.api", {
  getCompanySettings: async () => ({
    companyId: "co-1",
    operationTimezone: "America/Argentina/Buenos_Aires",
    defaultRadiusMeters: 150,
    lateGraceMinutes: 15,
    earlyLeaveToleranceMinutes: 15,
    requireCheckoutLocation: true,
    allowManualAttendanceCorrections: false,
    defaultEarlyArrivalToleranceMinutes: 60,
    defaultLateArrivalToleranceMinutes: 90,
    defaultOperationStartTime: null,
    defaultOperationEndTime: null,
    geofenceReviewMarginMeters: 30,
    confirmationReminderEnabled: false,
    confirmationReminderHoursBefore: 2,
    pendingOperationExpirationHours: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  updateCompanySettings: async () => {
    throw new Error("not used");
  },
  normalizeCompanySettings: (raw: unknown) => raw,
});

mockApiModule("api/company-work-schedule.api", {
  getCompanyWorkSchedule: async () => ({
    timezone: "America/Argentina/Buenos_Aires",
    days: [],
  }),
  updateCompanyWorkSchedule: async () => {
    throw new Error("not used");
  },
});

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";
import { getOperationDisplayName } from "../../utils/operation-display";

let renderPage: typeof import("../../test/render-page").renderPage;
let OperationDetailPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ OperationDetailPage } = await import("./OperationDetailPage"));
});

afterEach(() => {
  cleanup();
});

describe("OperationDetailPage entity identity", () => {
  it("shows avatar + display name matching getOperationDisplayName and keeps actions", async () => {
    const expected = getOperationDisplayName(operationDetail);
    const view = renderPage(
      <Routes>
        <Route path="/operations/:id" element={<OperationDetailPage />} />
      </Routes>,
      { route: "/operations/op-1" },
    );

    await waitFor(() => {
      assert.ok(view.getAllByText(expected).length >= 1);
    });

    const avatar = view.container.querySelector("[data-entity-avatar='operation']");
    assert.equal(avatar?.textContent, "S");
    assert.ok(view.getByRole("button", { name: "Volver al listado" }));
    assert.ok(view.getByRole("button", { name: "Más acciones de la operación" }));
    assert.match(view.container.textContent ?? "", /Detalle de la operación/i);
  });
});
