/**
 * Absence detail subphase 2.4: unified summary, collapsible balance, unified history.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS, ATTENDANCE_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EMPLOYEE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ATTENDANCE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const EMPLOYEE_WORKDAY_ID = "ew-1";

let membershipPermissions = ["absences:read", "absences:review", "attendance:read"];
let attendanceQueryShouldFail = false;
let attendanceQueryCalls = 0;

const operationalImpact = {
  absenceRequestId: REQUEST_ID,
  operationalImpactVersion: 1,
  featureEnabled: true,
  availabilityStatus: "UNAVAILABLE" as const,
  affectedOperations: 0,
  affectedServices: 0,
  affectedWorkdays: 0,
  affectedAssignments: 0,
  affectedWorkGroups: 0,
  attendanceConflicts: 0,
  staffingWarnings: [],
  requiresManualAction: false,
  operations: [],
  workdays: [],
  openConflicts: [],
  reconciliationStatus: "APPLIED" as const,
  reconciliationJobId: null,
  reconciliationLastError: null,
  reconciliationAttempts: 0,
};

function buildRequest() {
  return {
    id: REQUEST_ID,
    employeeId: EMPLOYEE_ID,
    absenceTypeId: "type-1",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    startPeriod: "FULL_DAY" as const,
    endPeriod: "FULL_DAY" as const,
    totalDays: 2,
    reason: "Vacaciones familiares",
    status: "PENDING" as const,
    requestedVia: "ADMIN" as const,
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
    events: [
      {
        id: "ev-1",
        absenceRequestId: REQUEST_ID,
        eventType: "CREATED",
        oldStatus: null,
        newStatus: "PENDING",
        performedByUserId: "user-1",
        performedByEmployeeId: null,
        comment: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        performerName: "Admin Test",
      },
    ],
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
}

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
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
    getAbsenceRequestById: async () => buildRequest(),
    getAbsenceOperationalImpact: async () => operationalImpact,
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
    getEmployeeAbsenceBalances: async () => [
      {
        absenceType: {
          id: "type-1",
          code: "VACATION",
          name: "Vacaciones",
          deductsBalance: true,
        },
        year: 2026,
        assignedDays: 10,
        approvedDays: 0,
        pendingDays: 2,
        rejectedDays: 0,
        cancelledDays: 0,
        availableDays: 10,
        projectedAvailableDays: 8,
        notes: null,
      },
    ],
    getAbsenceRequests: async () => ({
      data: [
        {
          id: OTHER_REQUEST_ID,
          employeeId: EMPLOYEE_ID,
          absenceTypeId: "type-1",
          startDate: "2026-03-01",
          endDate: "2026-03-01",
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          totalDays: 1,
          reason: "Otra",
          status: "APPROVED",
          requestedVia: "ADMIN",
          sourceMessageSid: null,
          reviewedByUserId: null,
          reviewedAt: null,
          reviewComment: null,
          cancelledAt: null,
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
          employee: buildRequest().employee,
          absenceType: { id: "type-1", code: "VACATION", name: "Vacaciones" },
          affectedOperationsCount: 0,
        },
      ],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    }),
    listAbsenceAttachments: async () => [],
  },
  ABSENCES_API_EXPORTS,
);

mockApiModule(
  "api/attendance.api",
  {
    getAttendanceRecords: async () => {
      attendanceQueryCalls += 1;
      if (attendanceQueryShouldFail) {
        throw new Error("attendance unavailable");
      }
      return {
        data: [
          {
            id: ATTENDANCE_ID,
            operationId: "op-1",
            employeeId: EMPLOYEE_ID,
            employeeWorkdayId: EMPLOYEE_WORKDAY_ID,
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
          createdAt: "2026-04-01T00:00:00.000Z",
          employee: buildRequest().employee,
          operation: {
            id: "op-1",
            status: "SCHEDULED",
            scheduledStart: "2026-04-01T08:00:00.000Z",
            scheduledEnd: "2026-04-01T17:00:00.000Z",
          },
          service: {
            id: "svc-1",
            name: "Servicio Centro",
            address: null,
            active: true,
          },
          hasAttendanceRecord: false,
          effectiveState: "ABSENT",
          workDate: "2026-04-01",
          listRowKey: EMPLOYEE_WORKDAY_ID,
        },
      ],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    };
    },
  },
  ATTENDANCE_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  membershipPermissions = ["absences:read", "absences:review", "attendance:read"];
  attendanceQueryShouldFail = false;
  attendanceQueryCalls = 0;
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("AbsenceDetailPage phase 2.4 UX", () => {
  it("uses a single request summary card instead of separate situation/detail/attachment cards", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Resumen de la solicitud"));
    });
    assert.equal(view.queryByText("Situación"), null);
    assert.equal(view.queryByText("Detalle de la solicitud"), null);
    assert.equal(view.queryAllByText("Documentación adjunta").length, 1);
    assert.match(view.container.textContent ?? "", /Vacaciones familiares/);
    assert.match(view.container.textContent ?? "", /No hay documentación adjunta/);
  });

  it("starts employee balance table collapsed and expands on demand", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /Ver saldo del empleado/i }));
    });

    const balanceTable = view.queryByLabelText("Saldo de ausencias del empleado");
    assert.equal(balanceTable, null);
    assert.match(view.container.textContent ?? "", /Disponible luego de aprobar: 8/);

    await user.click(view.getByRole("button", { name: /Ver saldo del empleado/i }));

    await waitFor(() => {
      assert.ok(view.getByLabelText("Saldo de ausencias del empleado"));
    });
  });

  it("unifies employee history with requests, absences and audit events", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
        <Route path="/absences/:otherId" element={<div>Otra solicitud</div>} />
        <Route path="/attendance/workdays/:employeeWorkdayId" element={<div>Detalle jornada</div>} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Historial del colaborador (2026)"));
    });
    assert.equal(view.queryByText("Historial del empleado (2026)"), null);
    assert.equal(view.queryByRole("heading", { name: "Historial" }), null);

    const historyTable = view.getByLabelText("Historial del colaborador");
    assert.ok(within(historyTable).getByText("Solicitud"));
    assert.ok(within(historyTable).getAllByText("Ausente").length >= 1);
    assert.ok(within(historyTable).getByText("Evento"));

    const verLinks = within(historyTable).getAllByRole("link", { name: "Ver" });
    assert.ok(
      verLinks.some((link) => link.getAttribute("href") === `/absences/${OTHER_REQUEST_ID}`),
    );
    assert.ok(
      verLinks.some(
        (link) => link.getAttribute("href") === `/attendance/workdays/${EMPLOYEE_WORKDAY_ID}`,
      ),
    );
  });

  it("shows warning when absent query fails but keeps request history visible", async () => {
    attendanceQueryShouldFail = true;
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByText(/No se pudieron cargar las inasistencias detectadas/i));
    });
    assert.ok(view.getByLabelText("Historial del colaborador"));
  });

  it("without attendance:read skips attendance query and shows permission notice", async () => {
    membershipPermissions = ["absences:read", "absences:review"];
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.match(
        view.container.textContent ?? "",
        /no están disponibles con tus permisos actuales/i,
      );
    });
    assert.equal(attendanceQueryCalls, 0);
  });

  it("without absences:review does not claim empty attachments", async () => {
    membershipPermissions = ["absences:read", "attendance:read"];
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.match(
        view.container.textContent ?? "",
        /documentación adjunta no está disponible/i,
      );
    });
    assert.doesNotMatch(view.container.textContent ?? "", /No hay documentación adjunta/i);
  });
});
