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
import { absenceRequestRepository } from "../repositories/absence-request.repository";
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
      "reconcileEmployeeWorkdays",
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
      "reconcileEmployeeWorkdays",
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

  it("justifies a newly created employee workday when an approved absence already exists", async () => {
    setupUnitTestEnv();
    process.env.RECURRING_WORKDAY_HORIZON_DAYS = "1";

    const workDate = "2026-08-10";
    const jsDay = new Date(`${workDate}T12:00:00.000Z`).getUTCDay();
    const enabledDay = WEEKDAYS[jsDay === 0 ? 6 : jsDay - 1]!;
    const createdEmployeeWorkdayId = "ew-created";

    mock.method(operationRepository, "findById", async () => recurringOperation);
    mock.method(operationScheduleRepository, "findByOperationId", async () => ({
      ...operationSchedule,
      validFrom: "2020-01-01",
      validUntil: null,
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
    mock.method(employeeWorkdayRepository, "findByWorkdayAndEmployee", async () => null);
    mock.method(employeeWorkdayRepository, "insert", async () => ({
      id: createdEmployeeWorkdayId,
      companyId: COMPANY_ID,
      operationWorkdayId: "ow-1",
      employeeId: "emp-1",
      operationAssignmentId: "assign-1",
      expectationStatus: "EXPECTED",
      absenceRequestId: null,
      cancellationReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(employeeWorkdayRepository, "isDuplicateKeyError", () => false);

    let batchJustifyInput: Array<{ employeeWorkdayId: string; absenceRequestId: string }> = [];
    let listWithWorkDatesCalls = 0;
    mock.method(employeeWorkdayRepository, "listWithWorkDatesByEmployeeWorkdayIds", async () => {
      listWithWorkDatesCalls += 1;
      return [
        {
          id: createdEmployeeWorkdayId,
          companyId: COMPANY_ID,
          operationWorkdayId: "ow-1",
          employeeId: "emp-1",
          operationAssignmentId: "assign-1",
          expectationStatus: listWithWorkDatesCalls > 1 ? "JUSTIFIED" : "EXPECTED",
          absenceRequestId: listWithWorkDatesCalls > 1 ? "absence-1" : null,
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workDate,
          expectedStartAt: "2026-08-10T12:00:00.000Z",
          expectedEndAt: "2026-08-10T21:00:00.000Z",
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 20,
          scheduleTimezone: TIMEZONE,
        },
      ];
    });
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => [
      {
        id: "absence-1",
        employeeId: "emp-1",
        absenceTypeId: "type-1",
        absenceTypeName: "Vacaciones",
        startDate: workDate,
        endDate: workDate,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        totalDays: 1,
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
      },
    ]);
    mock.method(employeeWorkdayRepository, "batchJustifyExpectations", async (_companyId, deltas) => {
      batchJustifyInput = deltas;
      return { updated: deltas.length, raceConflicts: 0 };
    });
    mock.method(employeeWorkdayRepository, "batchRelinkJustifiedExpectations", async () => 0);
    mock.method(employeeWorkdayRepository, "batchRestoreJustifiedExpectations", async () => 0);

    const originalDate = Date;
    const mockedNow = new originalDate("2026-08-09T15:00:00.000Z");
    // @ts-expect-error test override
    global.Date = class extends originalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(mockedNow.getTime());
          return;
        }
        super(...args);
      }
      static now() {
        return mockedNow.getTime();
      }
    };

    try {
      const { recurringWorkdayMaterializationService } = await import(
        "./recurring-workday-materialization.service"
      );

      const first = await recurringWorkdayMaterializationService.materializeOperationHorizon(
        COMPANY_ID,
        OPERATION_ID,
      );

      assert.equal(first.absenceReconciliation?.justified, 1);
      assert.equal(batchJustifyInput.length, 1);
      assert.equal(batchJustifyInput[0]?.employeeWorkdayId, createdEmployeeWorkdayId);
      assert.equal(batchJustifyInput[0]?.absenceRequestId, "absence-1");

      const second = await recurringWorkdayMaterializationService.materializeOperationHorizon(
        COMPANY_ID,
        OPERATION_ID,
      );
      assert.equal(second.absenceReconciliation?.justified, 0);
    } finally {
      global.Date = originalDate;
    }
  });
});
