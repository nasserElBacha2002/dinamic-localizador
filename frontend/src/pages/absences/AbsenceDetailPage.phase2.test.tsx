/**
 * Absence detail phase 2 UX: unified planning, coverage CTA, permissions.
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
const OPERATION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let membershipPermissions = ["absences:read", "absences:review"];
let requestStatus: "PENDING" | "APPROVED" = "PENDING";

const operationalImpact = {
  absenceRequestId: REQUEST_ID,
  operationalImpactVersion: 1,
  featureEnabled: true,
  availabilityStatus: "UNAVAILABLE" as const,
  affectedOperations: 1,
  affectedServices: 1,
  affectedWorkdays: 1,
  affectedAssignments: 1,
  affectedWorkGroups: 0,
  attendanceConflicts: 0,
  staffingWarnings: [],
  requiresManualAction: true,
  operations: [
    {
      assignmentId: "asg-1",
      operationId: OPERATION_ID,
      serviceId: "svc-1",
      serviceName: "Servicio Norte",
      employeeId: EMPLOYEE_ID,
      scheduledStart: "2026-08-01T08:00:00.000Z",
      scheduledEnd: "2026-08-01T17:00:00.000Z",
      operationStatus: "SCHEDULED",
      validFrom: "2026-08-01",
      validTo: null,
      categoryId: "cat-1",
      categoryName: "Mañana",
    },
  ],
  workdays: [
    {
      employeeWorkdayId: "wd-1",
      workDate: "2026-08-01",
      operationId: OPERATION_ID,
      serviceId: "svc-1",
      covered: false,
      hasAttendancePresence: false,
      conflictCode: null,
    },
  ],
  openConflicts: [
    {
      id: "conf-1",
      absenceRequestId: REQUEST_ID,
      conflictType: "OPERATION_AFFECTED" as const,
      severity: "WARNING" as const,
      status: "OPEN" as const,
      operationId: OPERATION_ID,
      serviceId: "svc-1",
      employeeId: EMPLOYEE_ID,
      assignmentId: "asg-1",
      employeeWorkdayId: "wd-1",
      replacementEmployeeId: null,
      resolutionCode: null,
      resolutionReason: null,
      resolvedAt: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
  ],
  reconciliationStatus: "APPLIED" as const,
  reconciliationJobId: null,
  reconciliationLastError: null,
  reconciliationAttempts: 1,
};

const noImpact = {
  ...operationalImpact,
  affectedOperations: 0,
  affectedWorkdays: 0,
  requiresManualAction: false,
  operations: [],
  workdays: [],
  openConflicts: [],
};

let impactOverride: typeof operationalImpact | null = null;

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
    status: requestStatus,
    requestedVia: "ADMIN" as const,
    sourceMessageSid: null,
    reviewedByUserId: requestStatus === "APPROVED" ? "user-1" : null,
    reviewedAt: requestStatus === "APPROVED" ? "2026-07-02T00:00:00.000Z" : null,
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
    getAbsenceOperationalImpact: async () => impactOverride ?? operationalImpact,
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
  membershipPermissions = ["absences:read", "absences:review", "operations:manage"];
  requestStatus = "PENDING";
  impactOverride = null;
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("AbsenceDetailPage phase 2 planning UX", () => {
  it("shows pending review as primary action and unified planning section once", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Planificación afectada"));
    });
    assert.ok(view.getByRole("button", { name: /^Aprobar$/i }));
    assert.equal(view.queryAllByText("Impacto operativo").length, 0);
    assert.equal(view.queryAllByText(/Impacto en operaciones/i).length, 0);
    assert.ok(view.getByText("Pendiente de aprobación"));
  });

  it("approved absence with vacancy shows Cubrir jornada linking to operation", async () => {
    requestStatus = "APPROVED";
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
        <Route path="/operations/:id" element={<div>Detalle operación</div>} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getAllByRole("link", { name: /Cubrir jornada/i }).length >= 1);
    });

    const coverLinks = view.getAllByRole("link", { name: /Cubrir jornada/i });
    assert.ok(
      coverLinks.some((link) => link.getAttribute("href") === `/operations/${OPERATION_ID}`),
    );
    assert.ok(view.getByText("Requiere cobertura"));
    assert.doesNotMatch(view.container.textContent ?? "", /reconciliationStatus/i);
  });

  it("without operations:manage user does not get executable coverage CTA", async () => {
    requestStatus = "APPROVED";
    membershipPermissions = ["absences:read", "absences:review"];
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Requiere cobertura"));
    });
    assert.equal(view.queryByRole("link", { name: /Cubrir jornada/i }), null);
    assert.ok(view.getByRole("link", { name: /Ver operación/i }));
    assert.match(view.container.textContent ?? "", /responsable con permisos operativos/i);
  });

  it("absence without impact shows clear state and no coverage CTA", async () => {
    requestStatus = "APPROVED";
    impactOverride = noImpact;

    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByText("Sin impacto operativo"));
    });
    assert.equal(view.queryByRole("link", { name: /Cubrir jornada/i }), null);
  });

  it("lists multiple affected workdays in a single planning section", async () => {
    requestStatus = "APPROVED";
    impactOverride = {
      ...operationalImpact,
      affectedOperations: 2,
      affectedWorkdays: 2,
      operations: [
        operationalImpact.operations[0]!,
        {
          ...operationalImpact.operations[0]!,
          assignmentId: "asg-2",
          operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          scheduledStart: "2026-08-02T08:00:00.000Z",
          scheduledEnd: "2026-08-02T17:00:00.000Z",
        },
      ],
      workdays: [
        operationalImpact.workdays[0]!,
        {
          ...operationalImpact.workdays[0]!,
          employeeWorkdayId: "wd-2",
          workDate: "2026-08-02",
          operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      ],
    };

    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.equal(
        view.getAllByRole("heading", { name: "Planificación afectada" }).length,
        1,
      );
    });
    assert.equal(view.getAllByRole("link", { name: /Cubrir jornada/i }).length, 3);
    assert.equal(view.queryAllByText("Impacto operativo").length, 0);
  });

  it("approval preview keeps impact summary without technical codes", async () => {
    membershipPermissions = ["absences:read", "absences:review", "operations:manage"];
    requestStatus = "PENDING";
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPage(
      <Routes>
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
      </Routes>,
      { route: `/absences/${REQUEST_ID}` },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /^Aprobar$/i }));
    });
    await user.click(view.getByRole("button", { name: /^Aprobar$/i }));

    const modal = await view.findByRole("dialog");
    assert.ok(within(modal).getByText(/1 jornada afectada/i));
    assert.doesNotMatch(modal.textContent ?? "", /reconciliationStatus/i);
  });
});
