import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { EmployeeWorkday, OperationWorkday } from "../types/workday";

const COMPANY_ID = "company-1";
const OPERATION_WORKDAY_ID = "ow-1";
const EMPLOYEE_ID = "emp-1";
const ASSIGNMENT_ID = "assign-1";

const operationWorkday = {
  id: OPERATION_WORKDAY_ID,
  companyId: COMPANY_ID,
  operationId: "op-1",
  workDate: "2026-08-10",
  expectedStartAt: "2026-08-10T12:00:00.000Z",
  expectedEndAt: "2026-08-10T21:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 20,
  scheduleVersion: 1,
  scheduleSourceSnapshot: "COMPANY",
  scheduleTimezoneSnapshot: "America/Argentina/Buenos_Aires",
  status: "ACTIVE",
  cancellationReason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} satisfies OperationWorkday;

const baseEmployeeWorkday = (
  overrides: Partial<EmployeeWorkday> = {},
): EmployeeWorkday => ({
  id: "ew-1",
  companyId: COMPANY_ID,
  operationWorkdayId: OPERATION_WORKDAY_ID,
  employeeId: EMPLOYEE_ID,
  operationAssignmentId: ASSIGNMENT_ID,
  expectationStatus: "EXPECTED",
  cancellationReason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("employeeWorkdayExpectationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns EXISTING for matching EXPECTED row", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayExpectationService } = await import("./employee-workday-expectation.service");
    const existing = baseEmployeeWorkday();

    const outcome = await employeeWorkdayExpectationService.ensureExpectedForRecurringAssignment({
      companyId: COMPANY_ID,
      operationWorkday,
      employeeId: EMPLOYEE_ID,
      operationAssignmentId: ASSIGNMENT_ID,
      existing,
      hasAttendance: false,
    });

    assert.equal(outcome.kind, "EXISTING");
  });

  it("reactivates SCHEDULE-cancelled expectation without attendance", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayExpectationService } = await import("./employee-workday-expectation.service");
    const existing = baseEmployeeWorkday({
      expectationStatus: "CANCELLED",
      cancellationReason: "SCHEDULE",
    });
    const reactivated = baseEmployeeWorkday();

    mock.method(employeeWorkdayRepository, "reactivateScheduleCancelledExpectation", async () => reactivated);

    const outcome = await employeeWorkdayExpectationService.ensureExpectedForRecurringAssignment({
      companyId: COMPANY_ID,
      operationWorkday,
      employeeId: EMPLOYEE_ID,
      operationAssignmentId: ASSIGNMENT_ID,
      existing,
      hasAttendance: false,
    });

    assert.equal(outcome.kind, "REACTIVATED");
  });

  it("does not reactivate ASSIGNMENT-cancelled expectation", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayExpectationService } = await import("./employee-workday-expectation.service");
    const existing = baseEmployeeWorkday({
      expectationStatus: "CANCELLED",
      cancellationReason: "ASSIGNMENT",
    });

    const outcome = await employeeWorkdayExpectationService.ensureExpectedForRecurringAssignment({
      companyId: COMPANY_ID,
      operationWorkday,
      employeeId: EMPLOYEE_ID,
      operationAssignmentId: ASSIGNMENT_ID,
      existing,
      hasAttendance: false,
    });

    assert.equal(outcome.kind, "UNCHANGED");
  });

  it("does not reactivate legacy CANCELLED row with null reason", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayExpectationService } = await import("./employee-workday-expectation.service");
    const existing = baseEmployeeWorkday({
      expectationStatus: "CANCELLED",
      cancellationReason: null,
    });

    const outcome = await employeeWorkdayExpectationService.ensureExpectedForRecurringAssignment({
      companyId: COMPANY_ID,
      operationWorkday,
      employeeId: EMPLOYEE_ID,
      operationAssignmentId: ASSIGNMENT_ID,
      existing,
      hasAttendance: false,
    });

    assert.equal(outcome.kind, "UNCHANGED");
  });

  it("does not reactivate when attendance exists", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayExpectationService } = await import("./employee-workday-expectation.service");
    const existing = baseEmployeeWorkday({
      expectationStatus: "CANCELLED",
      cancellationReason: "SCHEDULE",
    });

    const outcome = await employeeWorkdayExpectationService.ensureExpectedForRecurringAssignment({
      companyId: COMPANY_ID,
      operationWorkday,
      employeeId: EMPLOYEE_ID,
      operationAssignmentId: ASSIGNMENT_ID,
      existing,
      hasAttendance: true,
    });

    assert.equal(outcome.kind, "UNCHANGED");
  });
});
