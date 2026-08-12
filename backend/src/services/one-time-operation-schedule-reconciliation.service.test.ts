import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { oneTimeScheduleReconciliationCommand } from "./one-time-operation-schedule-reconciliation.service";
import { isNotificationRetryable } from "../utils/attendance-notification-retry";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORKDAY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

const staleWorkday = {
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
  status: "ACTIVE" as const,
  cancellationReason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("oneTimeScheduleReconciliationCommand", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("bumps schedule version and supersedes notifications on timing change", async () => {
    setupUnitTestEnv();
    const transaction = {} as sql.Transaction;
    let capturedVersion: { expected: number; next: number } | null = null;

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(operationWorkdayRepository, "listByOperationIdInTransaction", async () => [
      staleWorkday,
    ]);
    mock.method(
      operationWorkdayRepository,
      "hasAttendanceForWorkdayInTransaction",
      async () => false,
    );
    mock.method(
      operationWorkdayRepository,
      "updateWorkDateAndSnapshotInTransaction",
      async (_c, _t, _id, input) => {
        capturedVersion = {
          expected: input.expectedScheduleVersion,
          next: input.nextScheduleVersion,
        };
        return {
          ...staleWorkday,
          workDate: "2026-07-27",
          expectedStartAt: "2026-07-27T23:30:00.000Z",
          expectedEndAt: "2026-07-28T06:00:00.000Z",
          scheduleVersion: input.nextScheduleVersion,
        };
      },
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
      "supersedePendingForOperationScheduleChange",
      async () => 1,
    );
    mock.method(
      employeeWorkdayRepository,
      "insertMissingForActiveAssignmentsInTransaction",
      async () => 2,
    );

    const result = await oneTimeScheduleReconciliationCommand.reconcileInTransaction(
      COMPANY_ID,
      transaction,
      baseOperation,
      {
        timingChanged: true,
        toleranceChanged: false,
        workdaySnapshotChanged: true,
        confirmationScheduleChanged: true,
        reminderScheduleChanged: true,
        scheduleAffecting: true,
      },
    );

    assert.deepEqual(capturedVersion, { expected: 1, next: 2 });
    assert.equal(result.scheduleVersion, 2);
    assert.equal(result.notificationsSuperseded, 1);
    assert.equal(result.confirmationsReset, 2);
    assert.equal(result.employeeWorkdaysEnsured, 2);
  });

  it("does not bump reminder schedule version on tolerance-only", async () => {
    setupUnitTestEnv();
    const transaction = {} as sql.Transaction;
    let capturedVersion: { expected: number; next: number } | null = null;
    let supersedeCalls = 0;
    let resetCalls = 0;

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(operationWorkdayRepository, "listByOperationIdInTransaction", async () => [
      {
        ...staleWorkday,
        workDate: "2026-07-27",
        expectedStartAt: "2026-07-27T23:30:00.000Z",
        expectedEndAt: "2026-07-28T06:00:00.000Z",
        earlyToleranceMinutes: 60,
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
      async (_c, _t, _id, input) => {
        capturedVersion = {
          expected: input.expectedScheduleVersion,
          next: input.nextScheduleVersion,
        };
        return {
          ...staleWorkday,
          workDate: "2026-07-27",
          expectedStartAt: "2026-07-27T23:30:00.000Z",
          expectedEndAt: "2026-07-28T06:00:00.000Z",
          earlyToleranceMinutes: 45,
          scheduleVersion: input.nextScheduleVersion,
        };
      },
    );
    mock.method(
      operationEmployeeRepository,
      "updateActiveValidityForOperationInTransaction",
      async () => 0,
    );
    mock.method(
      employeeAssignmentQueryRepository,
      "resetConfirmationsForOperationScheduleChange",
      async () => {
        resetCalls += 1;
        return 0;
      },
    );
    mock.method(
      attendanceNotificationRepository,
      "supersedePendingForOperationScheduleChange",
      async () => {
        supersedeCalls += 1;
        return 0;
      },
    );
    mock.method(
      employeeWorkdayRepository,
      "insertMissingForActiveAssignmentsInTransaction",
      async () => 0,
    );

    const result = await oneTimeScheduleReconciliationCommand.reconcileInTransaction(
      COMPANY_ID,
      transaction,
      { ...baseOperation, earlyToleranceMinutes: 45 },
      {
        timingChanged: false,
        toleranceChanged: true,
        workdaySnapshotChanged: true,
        confirmationScheduleChanged: false,
        reminderScheduleChanged: false,
        scheduleAffecting: true,
      },
    );

    assert.deepEqual(capturedVersion, { expected: 1, next: 1 });
    assert.equal(result.scheduleVersion, 1);
    assert.equal(supersedeCalls, 0);
    assert.equal(resetCalls, 0);
  });

  it("rejects timing changes when attendance already exists", async () => {
    setupUnitTestEnv();
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(operationWorkdayRepository, "listByOperationIdInTransaction", async () => [
      staleWorkday,
    ]);
    mock.method(
      operationWorkdayRepository,
      "hasAttendanceForWorkdayInTransaction",
      async () => true,
    );

    await assert.rejects(
      () =>
        oneTimeScheduleReconciliationCommand.reconcileInTransaction(
          COMPANY_ID,
          {} as sql.Transaction,
          baseOperation,
          {
            timingChanged: true,
            toleranceChanged: false,
            workdaySnapshotChanged: true,
            confirmationScheduleChanged: true,
            reminderScheduleChanged: true,
            scheduleAffecting: true,
          },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_SCHEDULE_LOCKED_BY_ATTENDANCE",
    );
  });
});

describe("SUPERSEDED notification retry policy", () => {
  it("never retries SUPERSEDED notifications", () => {
    assert.equal(
      isNotificationRetryable(
        {
          status: "SUPERSEDED",
          attemptCount: 0,
          lastAttemptAt: null,
          createdAt: new Date().toISOString(),
        },
        new Date(),
        3,
      ),
      false,
    );
  });
});

describe("operationService.updateOneTime notes-only", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("does not open a reconciliation transaction for notes-only updates", async () => {
    setupUnitTestEnv();
    const { operationService } = await import("./operation.service");
    const { auditService } = await import("./audit.service");
    const { oneTimeScheduleReconciliationCommand } = await import(
      "./one-time-operation-schedule-reconciliation.service"
    );

    let reconcileCalls = 0;
    mock.method(operationRepository, "findById", async () => baseOperation);
    mock.method(operationRepository, "update", async (_companyId, _id, input) => ({
      ...baseOperation,
      notes: input.notes ?? baseOperation.notes,
    }));
    mock.method(
      oneTimeScheduleReconciliationCommand,
      "reconcileInTransaction",
      async () => {
        reconcileCalls += 1;
        return {
          operationWorkdayId: null,
          workDate: null,
          scheduleVersion: null,
          assignmentsUpdated: 0,
          confirmationsReset: 0,
          notificationsSuperseded: 0,
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
