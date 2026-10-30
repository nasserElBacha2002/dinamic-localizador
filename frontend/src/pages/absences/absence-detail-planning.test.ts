import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AbsenceOperationalImpact } from "../../types/absence-operational-impact";
import {
  buildAbsencePlanningRows,
  buildApprovalImpactPreviewText,
  buildOperationCoverageHref,
  deriveAbsenceOperationalSummary,
  selectPrimaryCoverageOperationId,
  shouldOfferCoverageAction,
} from "./absence-detail-planning";

const baseImpact = (overrides: Partial<AbsenceOperationalImpact> = {}): AbsenceOperationalImpact => ({
  absenceRequestId: "req-1",
  operationalImpactVersion: 1,
  featureEnabled: true,
  availabilityStatus: "UNAVAILABLE",
  affectedOperations: 1,
  affectedServices: 1,
  affectedWorkdays: 1,
  affectedAssignments: 1,
  affectedWorkGroups: 0,
  attendanceConflicts: 0,
  staffingWarnings: [],
  requiresManualAction: false,
  operations: [
    {
      assignmentId: "asg-1",
      operationId: "op-1",
      serviceId: "svc-1",
      serviceName: "Servicio Norte",
      employeeId: "emp-1",
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
      operationId: "op-1",
      serviceId: "svc-1",
      covered: false,
      hasAttendancePresence: false,
      conflictCode: null,
    },
  ],
  openConflicts: [],
  reconciliationStatus: "APPLIED",
  reconciliationJobId: null,
  reconciliationLastError: null,
  reconciliationAttempts: 1,
  ...overrides,
});

describe("absence-detail-planning", () => {
  it("marks approved uncovered workdays as requiring coverage", () => {
    const impact = baseImpact();
    assert.equal(shouldOfferCoverageAction("APPROVED", impact), true);
    assert.equal(selectPrimaryCoverageOperationId(impact), "op-1");
    assert.equal(buildOperationCoverageHref("op-1"), "/operations/op-1");
  });

  it("shows no operational impact when nothing is affected", () => {
    const summary = deriveAbsenceOperationalSummary({
      requestStatus: "APPROVED",
      impact: baseImpact({
        affectedOperations: 0,
        affectedWorkdays: 0,
        operations: [],
        workdays: [],
      }),
    });
    assert.equal(summary.label, "Sin impacto operativo");
  });

  it("keeps pending requests on approval review path", () => {
    const summary = deriveAbsenceOperationalSummary({
      requestStatus: "PENDING",
      impact: baseImpact(),
    });
    assert.equal(summary.label, "Pendiente de aprobación");
    assert.match(summary.nextStep, /Revisá la solicitud/i);
  });

  it("builds human planning rows without raw reconciliation codes", () => {
    const rows = buildAbsencePlanningRows(baseImpact(), "APPROVED");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.situationLabel, "Vacante pendiente");
    assert.equal(rows[0]?.shiftLabel, "Mañana");
    assert.doesNotMatch(rows[0]?.situationLabel ?? "", /reconciliationStatus/i);
  });

  it("summarizes approval preview without duplicate count boilerplate", () => {
    const text = buildApprovalImpactPreviewText(
      baseImpact({
        attendanceConflicts: 1,
        openConflicts: [
          {
            id: "c-1",
            absenceRequestId: "req-1",
            conflictType: "OPERATION_AFFECTED",
            severity: "WARNING",
            status: "OPEN",
            operationId: "op-1",
            serviceId: "svc-1",
            employeeId: "emp-1",
            assignmentId: "asg-1",
            employeeWorkdayId: "wd-1",
            replacementEmployeeId: null,
            resolutionCode: null,
            resolutionReason: null,
            resolvedAt: null,
            createdAt: "",
            updatedAt: "",
          },
        ],
      }),
    );
    assert.match(text ?? "", /jornada/i);
    assert.match(text ?? "", /asistencia/i);
    assert.match(text ?? "", /conflicto/i);
    assert.doesNotMatch(text ?? "", /reconciliationStatus/i);
  });
});
