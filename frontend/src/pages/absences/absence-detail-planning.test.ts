import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AbsenceOperationalImpact } from "../../types/absence-operational-impact";
import {
  buildAbsencePlanningRows,
  buildApprovalImpactPreviewText,
  buildOperationCoverageHref,
  deriveAbsenceOperationalSummary,
  findOperationForWorkday,
  resolveAbsencePlanningRowAction,
  selectPrimaryCoverageOperationId,
  shouldOfferCoverageAction,
} from "./absence-detail-planning";
import { operationalWorkdaySituationLabels } from "../../utils/operational-workday-presentation";

const assignmentConflict = (
  overrides: Partial<AbsenceOperationalImpact["openConflicts"][number]> = {},
): AbsenceOperationalImpact["openConflicts"][number] => ({
  id: "conf-1",
  absenceRequestId: "req-1",
  conflictType: "ASSIGNMENT_DURING_ABSENCE",
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
  ...overrides,
});

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
      covered: true,
      hasAttendancePresence: false,
      conflictCode: null,
      needsCoverage: true,
      hasOperationalReplacement: false,
    },
  ],
  openConflicts: [assignmentConflict()],
  reconciliationStatus: "APPLIED",
  reconciliationJobId: null,
  reconciliationLastError: null,
  reconciliationAttempts: 1,
  ...overrides,
});

describe("absence-detail-planning", () => {
  it("offers coverage when backend marks needsCoverage despite covered=true", () => {
    const impact = baseImpact();
    assert.equal(shouldOfferCoverageAction("APPROVED", impact), true);
    assert.equal(selectPrimaryCoverageOperationId(impact, "APPROVED"), "op-1");
    assert.equal(buildOperationCoverageHref("op-1"), "/operations/op-1");
    const href = buildOperationCoverageHref("op-1", {
      employeeWorkdayId: "ew-1",
      assignmentId: "as-1",
      absentEmployeeId: "emp-1",
      absenceRequestId: "req-1",
      workDate: "2026-10-30",
    });
    assert.match(href, /cover=1/);
  });

  it("does not offer coverage when replacement exists", () => {
    const impact = baseImpact({
      workdays: [
        {
          employeeWorkdayId: "wd-1",
          workDate: "2026-08-01",
          operationId: "op-1",
          serviceId: "svc-1",
          covered: true,
          hasAttendancePresence: false,
          conflictCode: null,
          needsCoverage: false,
          hasOperationalReplacement: true,
        },
      ],
      openConflicts: [],
    });
    assert.equal(shouldOfferCoverageAction("APPROVED", impact), false);
    const rows = buildAbsencePlanningRows(impact, "APPROVED");
    assert.equal(rows[0]?.situationLabel, operationalWorkdaySituationLabels.covered);
  });

  it("offers Cubrir jornada only when vacancy remains", () => {
    const impact = baseImpact();
    const rows = buildAbsencePlanningRows(impact, "APPROVED");
    const cover = resolveAbsencePlanningRowAction({
      row: rows[0]!,
      impact,
      requestId: "req-1",
      canManageOperations: true,
      canViewOperations: true,
    });
    assert.equal(cover.kind, "cover");
    if (cover.kind === "cover") {
      assert.equal(cover.label, "Cubrir jornada");
      assert.match(cover.href, /employeeWorkdayId=wd-1/);
    }
  });

  it("shows Ver cobertura without cover CTA when replacement exists", () => {
    const impact = baseImpact({
      workdays: [
        {
          ...baseImpact().workdays[0]!,
          needsCoverage: false,
          hasOperationalReplacement: true,
          coveredByEmployeeName: "María Gómez",
        },
      ],
      openConflicts: [],
    });
    const rows = buildAbsencePlanningRows(impact, "APPROVED");
    const action = resolveAbsencePlanningRowAction({
      row: rows[0]!,
      impact,
      requestId: "req-1",
      canManageOperations: true,
      canViewOperations: true,
    });
    assert.equal(action.kind, "view_operation");
    if (action.kind === "view_operation") {
      assert.equal(action.label, "Ver cobertura");
      assert.doesNotMatch(action.href, /cover=1/);
    }
    assert.match(rows[0]?.situationLabel ?? "", /María Gómez/);
  });

  it("labels cancelled operation workdays", () => {
    const impact = baseImpact({
      operations: [
        {
          ...baseImpact().operations[0]!,
          operationStatus: "CANCELLED",
        },
      ],
    });
    const rows = buildAbsencePlanningRows(impact, "APPROVED");
    assert.equal(rows[0]?.situationLabel, operationalWorkdaySituationLabels.workdayCancelled);
  });

  it("blocks cover mutation CTA when operational mutations are disabled (stale impact)", () => {
    const impact = baseImpact();
    const rows = buildAbsencePlanningRows(impact, "APPROVED");
    assert.equal(rows[0]?.needsCoverage, true);
    const blocked = resolveAbsencePlanningRowAction({
      row: rows[0]!,
      impact,
      requestId: "req-1",
      canManageOperations: true,
      canViewOperations: true,
      allowOperationalMutations: false,
    });
    assert.equal(blocked.kind, "view_operation");
    if (blocked.kind === "view_operation") {
      assert.equal(blocked.label, "Ver operación");
      assert.doesNotMatch(blocked.href, /cover=1/);
    }
  });

  it("matches operation by assignmentId when multiple assignments share operationId", () => {
    const impact = baseImpact({
      operations: [
        {
          ...baseImpact().operations[0]!,
          assignmentId: "asg-morning",
          categoryName: "Mañana",
        },
        {
          ...baseImpact().operations[0]!,
          assignmentId: "asg-afternoon",
          categoryName: "Tarde",
        },
      ],
      workdays: [
        {
          ...baseImpact().workdays[0]!,
          operationAssignmentId: "asg-afternoon",
        },
      ],
    });
    assert.equal(findOperationForWorkday(impact, "op-1", "asg-afternoon")?.assignmentId, "asg-afternoon");
    assert.equal(findOperationForWorkday(impact, "op-1"), undefined);
  });

  it("derives vacancy from open assignment conflict when needsCoverage omitted", () => {
    const impact = baseImpact({
      workdays: [
        {
          employeeWorkdayId: "wd-1",
          workDate: "2026-08-01",
          operationId: "op-1",
          serviceId: "svc-1",
          covered: true,
          hasAttendancePresence: false,
          conflictCode: null,
          needsCoverage: undefined as unknown as boolean,
          hasOperationalReplacement: false,
        },
      ],
    });
    assert.equal(shouldOfferCoverageAction("APPROVED", impact), true);
  });

  it("shows loading summary without treating as no impact", () => {
    const summary = deriveAbsenceOperationalSummary({
      requestStatus: "APPROVED",
      impact: undefined,
      impactLoading: true,
    });
    assert.equal(summary.label, "Evaluando planificación");
    assert.match(summary.nextStep, /Evaluando planificación/i);
  });

  it("builds one planning row per affected workday", () => {
    const impact = baseImpact({
      affectedWorkdays: 2,
      workdays: [
        {
          employeeWorkdayId: "wd-1",
          workDate: "2026-08-01",
          operationId: "op-1",
          serviceId: "svc-1",
          covered: true,
          hasAttendancePresence: false,
          conflictCode: null,
          needsCoverage: true,
          hasOperationalReplacement: false,
        },
        {
          employeeWorkdayId: "wd-2",
          workDate: "2026-08-02",
          operationId: "op-1",
          serviceId: "svc-1",
          covered: true,
          hasAttendancePresence: false,
          conflictCode: null,
          needsCoverage: true,
          hasOperationalReplacement: false,
        },
      ],
      openConflicts: [
        assignmentConflict({ id: "c1", employeeWorkdayId: "wd-1" }),
        assignmentConflict({ id: "c2", employeeWorkdayId: "wd-2" }),
      ],
    });
    const rows = buildAbsencePlanningRows(impact, "APPROVED");
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.workDate, "2026-08-01");
    assert.equal(rows[1]?.workDate, "2026-08-02");
  });

  it("summarizes approval preview without technical reconciliation codes", () => {
    const text = buildApprovalImpactPreviewText(
      baseImpact({
        attendanceConflicts: 1,
        openConflicts: [assignmentConflict(), assignmentConflict({ id: "c-2" })],
      }),
    );
    assert.match(text ?? "", /jornada/i);
    assert.match(text ?? "", /asistencia/i);
    assert.match(text ?? "", /conflicto/i);
    assert.doesNotMatch(text ?? "", /reconciliationStatus/i);
  });
});
