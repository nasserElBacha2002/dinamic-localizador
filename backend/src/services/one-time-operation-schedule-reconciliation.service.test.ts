import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { oneTimeOperationScheduleReconciliationService } from "./one-time-operation-schedule-reconciliation.service";
import { workdayMaterializationService } from "./workday-materialization.service";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORKDAY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMPLOYEE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ASSIGNMENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const baseOperation = {
  id: OPERATION_ID,
  serviceId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  operationKind: "ONE_TIME" as const,
  scheduledStart: "2026-07-27T23:30:00.000Z",
  scheduledEnd: "2026-07-28T06:00:00.000Z",
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 90,
  status: "SCHEDULED" as const,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("oneTimeOperationScheduleReconciliationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("updates workday in place, assignment validity, and invalidates pending notifications", async () => {
    setupUnitTestEnv();
    const transaction = {} as sql.Transaction;

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(operationWorkdayRepository, "listByOperationIdInTransaction", async () => [
      {
        id: WORKDAY_ID,
        companyId: COMPANY_ID,
        operationId: OPERATION_ID,
        workDate: "2026-07-16",
        expectedStartAt: "2026-07-16T23:30:00.000Z",
        expectedEndAt: "2026-07-17T06:00:00.000Z",
        earlyToleranceMinutes: 60,
        lateToleranceMinutes: 90,
        scheduleVersion: 1,
        scheduleSourceSnapshot: null,
        scheduleTimezoneSnapshot: "America/Argentina/Buenos_Aires",
        status: "ACTIVE",
        cancellationReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mock.method(
      operationWorkdayRepository,
      "hasAttendanceForWorkdayInTransaction",
      async () => false,
    );
    mock.method(
      operationWorkdayRepository,
      "updateWorkDateAndSnapshotInTransaction",
      async () => ({
        id: WORKDAY_ID,
        companyId: COMPANY_ID,
        operationId: OPERATION_ID,
        workDate: "2026-07-27",
        expectedStartAt: "2026-07-27T23:30:00.000Z",
        expectedEndAt: "2026-07-28T06:00:00.000Z",
        earlyToleranceMinutes: 60,
        lateToleranceMinutes: 90,
        scheduleVersion: 2,
        scheduleSourceSnapshot: null,
        scheduleTimezoneSnapshot: "America/Argentina/Buenos_Aires",
        status: "ACTIVE",
        cancellationReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    mock.method(
      operationEmployeeRepository,
      "updateActiveValidityForOperationInTransaction",
      async () => 2,
    );
    mock.method(
      employeeAssignmentQueryRepository,
      "resetConfirmationsForOperationScheduleChange",
      async () => 2,
    );
    mock.method(
      attendanceNotificationRepository,
      "failPendingForOperationScheduleChange",
      async () => 1,
    );
    mock.method(operationEmployeeRepository, "listByOperationInTransaction", async () => [
      {
        id: ASSIGNMENT_ID,
        operationId: OPERATION_ID,
        employeeId: EMPLOYEE_ID,
        validFrom: "2026-07-27",
        validUntil: "2026-07-27",
        cancelledAt: null,
      },
    ]);
    mock.method(
      workdayMaterializationService,
      "ensureEmployeeWorkdayForAssignmentInTransaction",
      async () => ({ id: "ew-1" }),
    );

    const result = await oneTimeOperationScheduleReconciliationService.reconcileInTransaction(
      COMPANY_ID,
      transaction,
      baseOperation,
      { timingChanged: true, toleranceChanged: false, scheduleAffecting: true },
    );

    assert.equal(result.workdayAction, "updated");
    assert.equal(result.workDate, "2026-07-27");
    assert.equal(result.scheduleVersion, 2);
    assert.equal(result.assignmentsUpdated, 2);
    assert.equal(result.confirmationsReset, 2);
    assert.equal(result.notificationsInvalidated, 1);
    assert.equal(result.employeeWorkdaysEnsured, 1);
  });

  it("rejects timing changes when attendance already exists", async () => {
    setupUnitTestEnv();
    const transaction = {} as sql.Transaction;

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(operationWorkdayRepository, "listByOperationIdInTransaction", async () => [
      {
        id: WORKDAY_ID,
        companyId: COMPANY_ID,
        operationId: OPERATION_ID,
        workDate: "2026-07-16",
        expectedStartAt: "2026-07-16T23:30:00.000Z",
        expectedEndAt: "2026-07-17T06:00:00.000Z",
        earlyToleranceMinutes: 60,
        lateToleranceMinutes: 90,
        scheduleVersion: 1,
        scheduleSourceSnapshot: null,
        scheduleTimezoneSnapshot: "America/Argentina/Buenos_Aires",
        status: "ACTIVE",
        cancellationReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mock.method(
      operationWorkdayRepository,
      "hasAttendanceForWorkdayInTransaction",
      async () => true,
    );

    await assert.rejects(
      () =>
        oneTimeOperationScheduleReconciliationService.reconcileInTransaction(
          COMPANY_ID,
          transaction,
          baseOperation,
          { timingChanged: true, toleranceChanged: false, scheduleAffecting: true },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_SCHEDULE_LOCKED_BY_ATTENDANCE",
    );
  });

  it("is a no-op when scheduleAffecting is false", async () => {
    const result = await oneTimeOperationScheduleReconciliationService.reconcileInTransaction(
      COMPANY_ID,
      {} as sql.Transaction,
      baseOperation,
      { timingChanged: false, toleranceChanged: false, scheduleAffecting: false },
    );
    assert.equal(result.workdayAction, "none");
    assert.equal(result.assignmentsUpdated, 0);
  });
});

describe("operationService.updateOneTime schedule reconciliation wiring", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("does not open a reconciliation transaction for notes-only updates", async () => {
    setupUnitTestEnv();
    const { operationService } = await import("./operation.service");
    const { auditService } = await import("./audit.service");

    let reconcileCalls = 0;
    mock.method(operationRepository, "findById", async () => baseOperation);
    mock.method(operationRepository, "update", async (_c, _id, input) => ({
      ...baseOperation,
      notes: input.notes ?? baseOperation.notes,
    }));
    mock.method(
      oneTimeOperationScheduleReconciliationService,
      "reconcileInTransaction",
      async () => {
        reconcileCalls += 1;
        return {
          operationWorkdayId: null,
          workDate: null,
          scheduleVersion: null,
          assignmentsUpdated: 0,
          confirmationsReset: 0,
          notificationsInvalidated: 0,
          employeeWorkdaysEnsured: 0,
          workdayAction: "none" as const,
        };
      },
    );
    mock.method(auditService, "log", async () => undefined);

    await operationService.update(COMPANY_ID, OPERATION_ID, { notes: "solo notas" });
    assert.equal(reconcileCalls, 0);
  });
});
