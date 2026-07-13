import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { ApprovedAbsenceForWorkday } from "../types/absence";

const COMPANY_ID = "company-1";
const EMPLOYEE_ID = "emp-1";
const OTHER_EMPLOYEE_ID = "emp-2";
const ABSENCE_A = "absence-a";
const ABSENCE_B = "absence-b";
const TIMEZONE = "America/Argentina/Buenos_Aires";

const approvedAbsence = (
  overrides: Partial<ApprovedAbsenceForWorkday> = {},
): ApprovedAbsenceForWorkday => ({
  id: ABSENCE_A,
  employeeId: EMPLOYEE_ID,
  absenceTypeId: "type-1",
  absenceTypeName: "Vacaciones",
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
  overrides: Partial<ReturnType<typeof workdayWithSchedule>> = {},
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
  expectedStartAt: "2026-08-03T09:00:00.000Z",
  expectedEndAt: "2026-08-03T15:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 20,
  scheduleTimezone: TIMEZONE,
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
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(employeeWorkdayRepository, "batchJustifyExpectations", async () => ({
      updated: 1,
      raceConflicts: 0,
    }));
    mock.method(employeeWorkdayRepository, "batchRelinkJustifiedExpectations", async () => 0);
    mock.method(employeeWorkdayRepository, "batchRestoreJustifiedExpectations", async () => 0);

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.justified, 1);
    assert.equal(result.attendanceConflicts, 0);
  });

  it("does not justify afternoon shifts for AM-only absences", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(absenceRequestRepository, "findById", async () =>
      approvedAbsence({
        startDate: "2026-08-03",
        endDate: "2026-08-03",
        startPeriod: "AM",
        endPeriod: "AM",
      }),
    );
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeAndDateRange", async () => [
      workdayWithSchedule({
        expectedStartAt: "2026-08-03T17:00:00.000Z",
        expectedEndAt: "2026-08-04T00:00:00.000Z",
      }),
    ]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => [
      approvedAbsence({
        startDate: "2026-08-03",
        endDate: "2026-08-03",
        startPeriod: "AM",
        endPeriod: "AM",
      }),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(employeeWorkdayRepository, "batchJustifyExpectations", async () => ({
      updated: 0,
      raceConflicts: 0,
    }));
    mock.method(employeeWorkdayRepository, "batchRelinkJustifiedExpectations", async () => 0);
    mock.method(employeeWorkdayRepository, "batchRestoreJustifiedExpectations", async () => 0);

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
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
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () =>
      new Set(["ew-1"]),
    );
    mock.method(employeeWorkdayRepository, "batchJustifyExpectations", async () => ({
      updated: 0,
      raceConflicts: 0,
    }));
    mock.method(employeeWorkdayRepository, "batchRelinkJustifiedExpectations", async () => 0);
    mock.method(employeeWorkdayRepository, "batchRestoreJustifiedExpectations", async () => 0);

    const result = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(result.attendanceConflicts, 1);
    assert.equal(result.justified, 0);
    assert.equal(result.unchanged, 1);
  });

  it("relinks when another approved absence remains after revocation", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    mock.method(employeeWorkdayRepository, "listWithWorkDatesByAbsenceRequestId", async () => [
      workdayWithSchedule({ expectationStatus: "JUSTIFIED", absenceRequestId: ABSENCE_A }),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => [
      approvedAbsence({
        id: ABSENCE_B,
        reviewedAt: "2026-07-02T12:00:00.000Z",
        createdAt: "2026-06-21T12:00:00.000Z",
      }),
    ]);
    mock.method(employeeWorkdayRepository, "batchJustifyExpectations", async () => ({
      updated: 0,
      raceConflicts: 0,
    }));
    mock.method(employeeWorkdayRepository, "batchRelinkJustifiedExpectations", async () => 1);
    mock.method(employeeWorkdayRepository, "batchRestoreJustifiedExpectations", async () => 0);

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
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => [
      approvedAbsence(),
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(employeeWorkdayRepository, "batchJustifyExpectations", async () => ({
      updated: 0,
      raceConflicts: 0,
    }));
    mock.method(employeeWorkdayRepository, "batchRelinkJustifiedExpectations", async () => 0);
    mock.method(employeeWorkdayRepository, "batchRestoreJustifiedExpectations", async () => 0);

    const second = await employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
      COMPANY_ID,
      ABSENCE_A,
    );

    assert.equal(second.justified, 0);
    assert.equal(second.unchanged, 1);
  });

  it("loads workdays and absences in batch for materialization range", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAbsenceReconciliationService } = await import(
      "./employee-workday-absence-reconciliation.service"
    );

    let employeeRangeCalls = 0;
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeesAndDateRange", async () => {
      employeeRangeCalls += 1;
      return [workdayWithSchedule(), workdayWithSchedule({ id: "ew-2", employeeId: OTHER_EMPLOYEE_ID })];
    });
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => []);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(employeeWorkdayRepository, "batchJustifyExpectations", async () => ({
      updated: 0,
      raceConflicts: 0,
    }));
    mock.method(employeeWorkdayRepository, "batchRelinkJustifiedExpectations", async () => 0);
    mock.method(employeeWorkdayRepository, "batchRestoreJustifiedExpectations", async () => 0);

    await employeeWorkdayAbsenceReconciliationService.reconcileMaterializationRange(
      COMPANY_ID,
      "2026-08-01",
      "2026-08-10",
      [EMPLOYEE_ID, OTHER_EMPLOYEE_ID],
    );

    assert.equal(employeeRangeCalls, 1);
  });
});
