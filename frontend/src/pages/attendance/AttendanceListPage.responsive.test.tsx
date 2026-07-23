import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ATTENDANCE_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule(
  "api/attendance.api",
  {
    getAttendanceRecords: async () => ({
      data: [
        {
          id: "att-1",
          operationId: "op-1",
          employeeId: "emp-1",
          receivedLatitude: -34.6,
          receivedLongitude: -58.4,
          distanceMeters: 12,
          validationStatus: "VALID",
          locationStatus: "INSIDE_GEOFENCE",
          punctualityStatus: "ON_TIME",
          sourceMessageSid: null,
          validationReason: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          receivedAt: "2026-07-21T12:00:00.000Z",
          checkoutAt: "2026-07-21T18:00:00.000Z",
          checkoutLatitude: null,
          checkoutLongitude: null,
          checkoutDistanceMeters: null,
          checkoutStatus: null,
          checkoutReviewReason: null,
          earlyDepartureMinutes: null,
          extraWorkedMinutes: null,
          checkoutMessageSid: null,
          isSimulation: false,
          simulationSessionId: null,
          createdAt: "2026-07-21T12:00:00.000Z",
          employee: {
            id: "emp-1",
            name: "Ada Lovelace",
            documentNumber: "30111222",
            phoneNumber: "+5491112345678",
            employeeType: "INTERNAL",
            active: true,
            categoryId: null,
            category: null,
            lastWorkedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          service: {
            id: "svc-1",
            name: "Sucursal Centro",
            address: "Av. Corrientes 1234",
            neighborhood: null,
            locality: null,
            serviceFormat: "SUPER",
            latitude: -34.6,
            longitude: -58.4,
            allowedRadiusMeters: 150,
            active: true,
            googlePlaceId: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          operation: {
            id: "op-1",
            status: "SCHEDULED",
            operationKind: "ONE_TIME",
            scheduledStart: "2026-07-21T12:00:00.000Z",
            scheduledEnd: "2026-07-21T18:00:00.000Z",
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 10,
            scheduleSummary: null,
          },
        },
      ],
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
  getEmployeeLookups: async () => [],
  getServiceLookups: async () => [],
  getOperationLookups: async () => [],
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let clearActiveTestQueryClients: typeof import("../../test/render-page").clearActiveTestQueryClients;
let AttendanceListPage: React.ComponentType;

before(async () => {
  ({ renderPage, clearActiveTestQueryClients } = await import("../../test/render-page"));
  ({ AttendanceListPage } = await import("./AttendanceListPage"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  mockViewport("desktop");
});

describe("AttendanceListPage responsive (real page)", () => {
  it("shows desktop table", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/attendance" element={<AttendanceListPage />} />
      </Routes>,
      { route: "/attendance" },
    );

    await waitFor(() => assert.ok(view.getByText("Ada Lovelace")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile summary cards and filter drawer", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/attendance" element={<AttendanceListPage />} />
      </Routes>,
      { route: "/attendance" },
    );

    await waitFor(() => assert.ok(view.getByText("Ada Lovelace")));
    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("button", { name: /^Filtros/ }));

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("combobox", { name: "Validación" }));
    });
    fireEvent.click(within(document.body).getByRole("button", { name: "Listo" }));
  });
});
