import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { AbsenceRequest } from "../types/absence";
import type { EmployeeWorkday } from "../types/workday";

const COMPANY_ID = "company-1";
const EMPLOYEE_ID = "emp-1";
const OTHER_EMPLOYEE_ID = "emp-2";
const ABSENCE_A = "absence-a";
const ABSENCE_B = "absence-b";

const approvedAbsence = (overrides: Partial<AbsenceRequest> = {}): AbsenceRequest => ({
  id: ABSENCE_A,
  employeeId: EMPLOYEE_ID,
  absenceTypeId: "type-1",
  startDate: "2026-08-01",
  endDate: "2026-08-10",
  startPeriod: "FULL_DAY",
  endPeriod: "FULL_DAY",
  totalDays: 10,
  reason: "Vacaciones",
  status: "APPROVED",
  requestedVia: "ADMIN",
  sourceMessageSid: null,
  reviewedByUserId: "user-1",
  reviewedAt: "2026-07-01T12:00:00.000Z",
  reviewComment: null,
  cancelledAt: null,
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-07-01T12:00:00.000Z",
  ...overrides,
});

const workdayWithSchedule = (
  overrides: Partial<EmployeeWorkday> & {
    workDate?: string;
    expectedStartAt?: string;
    expectedEndAt?: string | null;
  } = {},
) => ({
  id: "ew-1",
  companyId: COMPANY_ID,
  operationWorkdayId: "ow-1",
  employeeId: EMPLOYEE_ID,
  operationAssignmentId: "assign-1",
  expectationStatus: "EXPECTED" as const,
  absenceRequestId: null,
  cancellationReason: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  workDate: "2026-08-03",
  expectedStartAt: "2026-08-03T01:00:00.000Z",
  expectedEndAt: "2026-08-03T09:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 20,
  ...overrides,
});

describe("employeeWorkdayAbsenceReconciliationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("justifies EXPECTED workdays when absence is approved after materialization", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(absenceRequestRepository, "findById", async () => approvedAbsence());
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeAndDateRange", async () => [
      workdayWithSchedule(),
    ]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(employeeWorkdayRepository, "justifyExpectation", async () =>
      workdayWithSchedule({ expectationStatus: "JUSTIFIED", absenceRequestId: ABSENCE_A }),
    );

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.justified, 1);
    assert.equal(result.attendanceConflicts, 0);
  });

  it("leaves EXPECTED unchanged when absence does not cover work date", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(absenceRequestRepository, "findById", async () =>
      approvedAbsence({ startDate: "2026-08-20", endDate: "2026-08-25" }),
    );
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeAndDateRange", async () => [
      workdayWithSchedule({ workDate: "2026-08-03" }),
    ]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => []);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.justified, 0);
    assert.equal(result.unchanged, 1);
  });

  it("does not justify workdays for a different employee", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(absenceRequestRepository, "findById", async () => approvedAbsence());
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeAndDateRange", async () => [
      workdayWithSchedule({ employeeId: OTHER_EMPLOYEE_ID }),
    ]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileEmployeeDateRange(
      COMPANY_ID,
      EMPLOYEE_ID,
      "2026-08-01",
      "2026-08-10",
    );

    assert.equal(result.justified, 0);
    assert.equal(result.unchanged, 1);
  });

  it("reports attendance conflicts for retroactive approval without rewriting workday", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(absenceRequestRepository, "findById", async () => approvedAbsence());
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeAndDateRange", async () => [
      workdayWithSchedule(),
    ]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () =>
      new Set(["ew-1"]),
    );

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.attendanceConflicts, 1);
    assert.equal(result.justified, 0);
    assert.equal(result.unchanged, 1);
  });

  it("restores JUSTIFIED workdays when absence is revoked", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(employeeWorkdayRepository, "listWithWorkDatesByAbsenceRequestId", async () => [
      workdayWithSchedule({ expectationStatus: "JUSTIFIED", absenceRequestId: ABSENCE_A }),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(absenceRequestRepository, "findById", async () =>
      approvedAbsence({ status: "CANCELLED" }),
    );
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => []);
    mock.method(employeeWorkdayRepository, "restoreJustifiedExpectation", async () =>
      workdayWithSchedule(),
    );

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.restored, 1);
  });

  it("relinks to another approved absence when one is removed", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(employeeWorkdayRepository, "listWithWorkDatesByAbsenceRequestId", async () => [
      workdayWithSchedule({ expectationStatus: "JUSTIFIED", absenceRequestId: ABSENCE_A }),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(absenceRequestRepository, "findById", async () =>
      approvedAbsence({ status: "CANCELLED" }),
    );
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => [
      approvedAbsence({
        id: ABSENCE_B,
        reviewedAt: "2026-07-02T12:00:00.000Z",
        createdAt: "2026-06-21T12:00:00.000Z",
      }),
    ]);
    mock.method(employeeWorkdayRepository, "relinkJustifiedExpectation", async () =>
      workdayWithSchedule({ expectationStatus: "JUSTIFIED", absenceRequestId: ABSENCE_B }),
    );

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.relinked, 1);
    assert.equal(result.restored, 0);
  });

  it("is idempotent on repeated reconciliation", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    const justified = workdayWithSchedule({
      expectationStatus: "JUSTIFIED",
      absenceRequestId: ABSENCE_A,
    });

    mock.method(absenceRequestRepository, "findById", async () => approvedAbsence());
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeAndDateRange", async () => [justified]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());

    const first = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );
    const second = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(first.justified, 0);
    assert.equal(second.justified, 0);
    assert.equal(second.unchanged, 1);
  });

  it("keeps cancelled workdays unchanged", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(absenceRequestRepository, "findById", async () => approvedAbsence());
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeAndDateRange", async () => [
      workdayWithSchedule({ expectationStatus: "CANCELLED", cancellationReason: "ASSIGNMENT" }),
    ]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeeAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.justified, 0);
    assert.equal(result.unchanged, 1);
  });
});
