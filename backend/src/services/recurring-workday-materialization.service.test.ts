import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { WEEKDAYS } from "../constants/weekday";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { addDaysToDateIso } from "../utils/recurring-workday-instant";
import type { OperationWorkday } from "../types/workday";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";

const emptyAbsenceReconciliation = async () => ({
  justified: 0,
  restored: 0,
  relinked: 0,
  unchanged: 0,
  attendanceConflicts: 0,
});

const COMPANY_ID = "company-1";
const OPERATION_ID = "op-1";
const TIMEZONE = "America/Argentina/Buenos_Aires";

const buildWeekdays = (enabledDay: string) =>
  WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    isEnabled: dayOfWeek === enabledDay,
    startTime: dayOfWeek === enabledDay ? "09:00" : null,
    endTime: dayOfWeek === enabledDay ? "18:00" : null,
  }));

const recurringOperation = {
  id: OPERATION_ID,
  companyId: COMPANY_ID,
  operationKind: "RECURRING",
  status: "SCHEDULED",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 20,
  serviceId: "service-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const operationSchedule = {
  id: "os-1",
  companyId: COMPANY_ID,
  operationId: OPERATION_ID,
  scheduleSource: "CUSTOM" as const,
  timezone: TIMEZONE,
  validFrom: "2020-01-01",
  validUntil: null,
  version: 1,
  days: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("recurringWorkdayMaterializationService orchestration", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("creates workdays on first run and reports zero created on second run", async () => {
    setupUnitTestEnv();
    process.env.RECURRING_WORKDAY_HORIZON_DAYS = "2";

    const today = getDateIsoInTimezone(new Date(), TIMEZONE);
    const tomorrow = addDaysToDateIso(today, 1);
    const jsDay = new Date(`${today}T12:00:00.000Z`).getUTCDay();
    const weekdayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const enabledDay = WEEKDAYS[weekdayIndex]!;

    const storedWorkdays = new Map<string, OperationWorkday>();
    let insertCount = 0;

    mock.method(operationRepository, "findById", async () => recurringOperation);
    mock.method(operationScheduleRepository, "findByOperationId", async () => ({
      ...operationSchedule,
      days: buildWeekdays(enabledDay),
    }));
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);
    mock.method(operationEmployeeRepository, "listOverlappingForOperationInDateRange", async () => []);
    mock.method(employeeWorkdayRepository, "listByOperationWorkdayIds", async () => []);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(operationWorkdayRepository, "listByOperationAndDateRange", async () =>
      [...storedWorkdays.values()],
    );
    mock.method(operationWorkdayRepository, "isDuplicateKeyError", () => false);
    mock.method(
      employeeWorkdayAbsenceReconciliationService,
      "reconcileMaterializationRange",
      emptyAbsenceReconciliation,
    );
    mock.method(operationWorkdayRepository, "insert", async (_companyId, payload) => {
      insertCount += 1;
      const created = {
        id: `ow-${insertCount}`,
        companyId: COMPANY_ID,
        operationId: OPERATION_ID,
        workDate: payload.workDate,
        expectedStartAt: payload.expectedStartAt.toISOString(),
        expectedEndAt: payload.expectedEndAt.toISOString(),
        earlyToleranceMinutes: payload.earlyToleranceMinutes,
        lateToleranceMinutes: payload.lateToleranceMinutes,
        scheduleVersion: payload.scheduleVersion,
        scheduleSourceSnapshot: payload.scheduleSourceSnapshot,
        scheduleTimezoneSnapshot: payload.scheduleTimezoneSnapshot,
        status: payload.status,
        cancellationReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies OperationWorkday;
      storedWorkdays.set(payload.workDate, created);
      return created;
    });

    const { recurringWorkdayMaterializationService } = await import(
      "./recurring-workday-materialization.service"
    );

    const first = await recurringWorkdayMaterializationService.materializeOperationHorizon(
      COMPANY_ID,
      OPERATION_ID,
    );
    assert.ok(first.operationWorkdaysCreated >= 1);

    const second = await recurringWorkdayMaterializationService.materializeOperationHorizon(
      COMPANY_ID,
      OPERATION_ID,
    );
    assert.equal(second.operationWorkdaysCreated, 0);
    assert.equal(second.employeeWorkdaysCreated, 0);
    assert.ok([today, tomorrow].includes(first.rangeStart) || first.rangeEnd >= today);
  });

  it("does not call findByWorkdayAndEmployee for each assignment/workday pair", async () => {
    setupUnitTestEnv();
    process.env.RECURRING_WORKDAY_HORIZON_DAYS = "1";

    const today = getDateIsoInTimezone(new Date(), TIMEZONE);
    const jsDay = new Date(`${today}T12:00:00.000Z`).getUTCDay();
    const enabledDay = WEEKDAYS[jsDay === 0 ? 6 : jsDay - 1]!;

    let findByPairCalls = 0;

    mock.method(operationRepository, "findById", async () => recurringOperation);
    mock.method(operationScheduleRepository, "findByOperationId", async () => ({
      ...operationSchedule,
      days: buildWeekdays(enabledDay),
    }));
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);
    mock.method(operationWorkdayRepository, "listByOperationAndDateRange", async () => []);
    mock.method(operationWorkdayRepository, "isDuplicateKeyError", () => false);
    mock.method(operationWorkdayRepository, "insert", async (_companyId, payload) => ({
      id: "ow-1",
      companyId: COMPANY_ID,
      operationId: OPERATION_ID,
      workDate: payload.workDate,
      expectedStartAt: payload.expectedStartAt.toISOString(),
      expectedEndAt: payload.expectedEndAt.toISOString(),
      earlyToleranceMinutes: payload.earlyToleranceMinutes,
      lateToleranceMinutes: payload.lateToleranceMinutes,
      scheduleVersion: payload.scheduleVersion,
      scheduleSourceSnapshot: payload.scheduleSourceSnapshot,
      scheduleTimezoneSnapshot: payload.scheduleTimezoneSnapshot,
      status: payload.status,
      cancellationReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(operationEmployeeRepository, "listOverlappingForOperationInDateRange", async () => [
      {
        id: "assign-1",
        companyId: COMPANY_ID,
        operationId: OPERATION_ID,
        employeeId: "emp-1",
        validFrom: "2020-01-01",
        validUntil: null,
        cancelledAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mock.method(employeeWorkdayRepository, "listByOperationWorkdayIds", async () => []);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(employeeWorkdayRepository, "findByWorkdayAndEmployee", async () => {
      findByPairCalls += 1;
      return null;
    });
    mock.method(employeeWorkdayRepository, "insert", async () => ({
      id: "ew-1",
      companyId: COMPANY_ID,
      operationWorkdayId: "ow-1",
      employeeId: "emp-1",
      operationAssignmentId: "assign-1",
      expectationStatus: "EXPECTED",
      cancellationReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(employeeWorkdayRepository, "isDuplicateKeyError", () => false);
    mock.method(
      employeeWorkdayAbsenceReconciliationService,
      "reconcileMaterializationRange",
      emptyAbsenceReconciliation,
    );

    const { recurringWorkdayMaterializationService } = await import(
      "./recurring-workday-materialization.service"
    );
    await recurringWorkdayMaterializationService.materializeOperationHorizon(COMPANY_ID, OPERATION_ID);

    assert.equal(findByPairCalls, 0);
  });

  it("cancels future workdays and expectations when parent operation is cancelled", async () => {
    setupUnitTestEnv();

    const futureWorkday = {
      id: "ow-future",
      companyId: COMPANY_ID,
      operationId: OPERATION_ID,
      workDate: "2099-01-01",
      expectedStartAt: "2099-01-01T12:00:00.000Z",
      expectedEndAt: "2099-01-01T21:00:00.000Z",
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 20,
      scheduleVersion: 1,
      scheduleSourceSnapshot: "CUSTOM",
      scheduleTimezoneSnapshot: TIMEZONE,
      status: "ACTIVE",
      cancellationReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies OperationWorkday;

    let cancelledWorkdayReason: string | null = null;
    let cancelledEmployeeReason: string | null = null;

    mock.method(operationWorkdayRepository, "listFutureMutableByOperation", async () => [futureWorkday]);
    mock.method(employeeWorkdayRepository, "listByOperationWorkdayIds", async () => [
      {
        id: "ew-1",
        companyId: COMPANY_ID,
        operationWorkdayId: futureWorkday.id,
        employeeId: "emp-1",
        operationAssignmentId: "assign-1",
        expectationStatus: "EXPECTED",
        cancellationReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mock.method(employeeWorkdayRepository, "listAttendancePresenceForEmployeeWorkdayIds", async () => new Set());
    mock.method(operationWorkdayRepository, "cancelWorkday", async (_companyId, _id, reason) => {
      cancelledWorkdayReason = reason;
      return futureWorkday;
    });
    mock.method(employeeWorkdayRepository, "cancelExpectedForWorkday", async (_companyId, _id, reason) => {
      cancelledEmployeeReason = reason;
      return 1;
    });

    const { recurringWorkdayMaterializationService } = await import(
      "./recurring-workday-materialization.service"
    );

    const result =
      await recurringWorkdayMaterializationService.reconcileFutureWorkdaysForCancelledOperation(
        COMPANY_ID,
        OPERATION_ID,
      );

    assert.equal(result.operationWorkdaysCancelled, 1);
    assert.equal(result.employeeWorkdaysCancelled, 1);
    assert.equal(cancelledWorkdayReason, "OPERATION");
    assert.equal(cancelledEmployeeReason, "OPERATION");
  });
});
