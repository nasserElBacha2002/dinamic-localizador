import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../../errors/app-error";
import { WEEKDAYS } from "../../constants/weekday";
import { setTestPool } from "../../database/connection";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { companyWorkScheduleRepository } from "../../repositories/companies/company-work-schedule.repository";
import { operationRepository } from "../../repositories/operations/operation.repository";
import { operationScheduleRepository } from "../../repositories/operations/operation-schedule.repository";
import { operationShiftRepository } from "../../repositories/operations/operation-shift.repository";
import { operationShiftVersionRepository } from "../../repositories/operations/operation-shift-version.repository";
import { recurringWorkdayMaterializationService } from "../workdays/recurring-workday-materialization.service";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

const COMPANY_ID = "company-1";
const SERVICE_ID = "service-1";

const tolerances = {
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  earlyToleranceSource: "COMPANY_DEFAULT" as const,
  lateToleranceSource: "COMPANY_DEFAULT" as const,
};

const customScheduleDays = WEEKDAYS.map((dayOfWeek, index) => ({
  dayOfWeek,
  isEnabled: index < 5,
  startTime: "09:00",
  endTime: "18:00",
}));

const buildBatchRow = (serviceId = SERVICE_ID) => ({
  input: {
    operationKind: "RECURRING" as const,
    scheduleMode: "SINGLE" as const,
    serviceId,
    validFrom: "2026-12-01",
    validUntil: null,
    scheduleSource: "CUSTOM" as const,
    scheduleDays: customScheduleDays,
    earlyToleranceMinutes: null,
    lateToleranceMinutes: null,
  },
  tolerances,
});

const enabledShiftDays = [{ dayOfWeek: 1, isEnabled: true }];

const buildMultiShiftBatchRow = (serviceId = SERVICE_ID) => ({
  input: {
    operationKind: "RECURRING" as const,
    scheduleMode: "MULTI_SHIFT" as const,
    serviceId,
    validFrom: "2026-12-01",
    validUntil: null,
    scheduleSource: "COMPANY" as const,
    earlyToleranceMinutes: null,
    lateToleranceMinutes: null,
    shifts: [
      {
        code: "MANANA",
        name: "Mañana",
        startTime: "06:00",
        endTime: "14:00",
        sortOrder: 0,
        days: enabledShiftDays,
      },
      {
        code: "TARDE",
        name: "Tarde",
        startTime: "14:00",
        endTime: "22:00",
        sortOrder: 1,
        days: enabledShiftDays,
      },
    ],
  },
  tolerances,
});

describe("operationService.createRecurringImportBatch", () => {
  const restores: Array<() => void> = [];
  let transactionCommitted = false;
  let transactionRollbackCalls = 0;
  let createRecurringCalls = 0;
  let materializeCalls = 0;
  let createShiftIdentityCalls = 0;

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
    transactionCommitted = false;
    transactionRollbackCalls = 0;
    createRecurringCalls = 0;
    materializeCalls = 0;
    createShiftIdentityCalls = 0;
    for (const restore of restores.splice(0)) {
      restore();
    }
  });

  const patchTransaction = () => {
    const OriginalTransaction = sql.Transaction;
    class FakeTransaction {
      async begin(): Promise<void> {
        return undefined;
      }

      async commit(): Promise<void> {
        transactionCommitted = true;
      }

      async rollback(): Promise<void> {
        transactionRollbackCalls += 1;
      }
    }

    (sql as { Transaction: typeof sql.Transaction }).Transaction =
      FakeTransaction as unknown as typeof sql.Transaction;
    restores.push(() => {
      (sql as { Transaction: typeof sql.Transaction }).Transaction = OriginalTransaction;
    });
  };

  const mockPersistDependencies = (options: { withCompanySchedule?: boolean } = {}) => {
    mock.method(
      companyWorkScheduleRepository,
      "findByCompanyId",
      async () =>
        options.withCompanySchedule
          ? {
              id: "schedule-1",
              companyId: COMPANY_ID,
              timezone: "America/Argentina/Buenos_Aires",
              days: customScheduleDays,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : null,
    );
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(operationScheduleRepository, "createInTransaction", async () => ({
      id: "schedule-1",
      companyId: COMPANY_ID,
      operationId: "operation-1",
      scheduleSource: "CUSTOM",
      timezone: "America/Argentina/Buenos_Aires",
      validFrom: "2026-12-01",
      validUntil: null,
      version: 1,
      days: customScheduleDays,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      recurringWorkdayMaterializationService,
      "materializeOperationHorizon",
      async () => {
        materializeCalls += 1;
      },
    );
  };

  it("rolls back and skips commit when persistence fails before commit", async () => {
    setupUnitTestEnv();
    setTestPool({ connected: true } as sql.ConnectionPool);
    patchTransaction();
    mockPersistDependencies();

    mock.method(operationRepository, "createRecurring", async (_companyId, _input, _tx) => {
      createRecurringCalls += 1;
      if (createRecurringCalls === 2) {
        throw new Error("persist failed");
      }
      return {
        id: `operation-${createRecurringCalls}`,
        serviceId: SERVICE_ID,
        operationKind: "RECURRING",
        scheduleMode: "SINGLE",
        scheduledStart: null,
        scheduledEnd: null,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        earlyToleranceSource: "COMPANY_DEFAULT",
        lateToleranceSource: "COMPANY_DEFAULT",
        status: "SCHEDULED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    const { operationService } = await import("./operation.service");

    await assert.rejects(
      () =>
        operationService.createRecurringImportBatch(COMPANY_ID, [
          buildBatchRow(),
          buildBatchRow(),
        ]),
      /persist failed/,
    );

    assert.equal(transactionCommitted, false);
    assert.equal(transactionRollbackCalls, 1);
    assert.equal(createRecurringCalls, 2);
  });

  it("commits the batch before materialization", async () => {
    setupUnitTestEnv();
    setTestPool({ connected: true } as sql.ConnectionPool);
    patchTransaction();
    mockPersistDependencies();

    mock.method(operationRepository, "createRecurring", async () => ({
      id: "operation-1",
      serviceId: SERVICE_ID,
      operationKind: "RECURRING",
      scheduleMode: "SINGLE",
      scheduledStart: null,
      scheduledEnd: null,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 15,
      earlyToleranceSource: "COMPANY_DEFAULT",
      lateToleranceSource: "COMPANY_DEFAULT",
      status: "SCHEDULED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const { operationService } = await import("./operation.service");
    const batchResult = await operationService.createRecurringImportBatch(COMPANY_ID, [buildBatchRow()]);

    assert.equal(batchResult.operations.length, 1);
    assert.equal(batchResult.workdaySyncError, null);
    assert.equal(transactionCommitted, true);
    assert.equal(transactionRollbackCalls, 0);
  });

  it("does not rollback after commit when materialization fails", async () => {
    setupUnitTestEnv();
    setTestPool({ connected: true } as sql.ConnectionPool);
    patchTransaction();
    mockPersistDependencies();

    mock.method(operationRepository, "createRecurring", async () => ({
      id: "operation-1",
      serviceId: SERVICE_ID,
      operationKind: "RECURRING",
      scheduleMode: "SINGLE",
      scheduledStart: null,
      scheduledEnd: null,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 15,
      earlyToleranceSource: "COMPANY_DEFAULT",
      lateToleranceSource: "COMPANY_DEFAULT",
      status: "SCHEDULED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      recurringWorkdayMaterializationService,
      "materializeOperationHorizon",
      async () => {
        throw new Error("materialization failed");
      },
    );

    const { operationService } = await import("./operation.service");

    const result = await operationService.createRecurringImportBatch(COMPANY_ID, [buildBatchRow()]);

    assert.equal(result.operations.length, 1);
    assert.ok(result.workdaySyncError);
    assert.equal(result.workdaySyncError?.code, "RECURRING_WORKDAY_SYNC_FAILED");
    assert.equal(transactionCommitted, true);
    assert.equal(transactionRollbackCalls, 0);
  });

  it("rolls back MULTI_SHIFT seed failures without commit or materialization", async () => {
    setupUnitTestEnv();
    setTestPool({ connected: true } as sql.ConnectionPool);
    patchTransaction();
    mockPersistDependencies({ withCompanySchedule: true });

    mock.method(operationRepository, "createRecurring", async () => ({
      id: "operation-1",
      serviceId: SERVICE_ID,
      operationKind: "RECURRING",
      scheduleMode: "SINGLE",
      scheduledStart: null,
      scheduledEnd: null,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 15,
      earlyToleranceSource: "COMPANY_DEFAULT",
      lateToleranceSource: "COMPANY_DEFAULT",
      status: "SCHEDULED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(operationShiftRepository, "createIdentityInTransaction", async () => {
      createShiftIdentityCalls += 1;
      if (createShiftIdentityCalls === 2) {
        throw new Error("shift seed failed");
      }
      return {
        id: `shift-${createShiftIdentityCalls}`,
        companyId: COMPANY_ID,
        operationId: "operation-1",
        templateId: null,
        code: createShiftIdentityCalls === 1 ? "MANANA" : "TARDE",
        name: "Turno",
        sortOrder: createShiftIdentityCalls - 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    mock.method(operationShiftVersionRepository, "createWithOverlapGuard", async () => ({
      id: "shift-version-1",
      companyId: COMPANY_ID,
      operationShiftId: "shift-1",
      effectiveFrom: "2026-12-01",
      effectiveUntil: null,
      startTime: "06:00",
      endTime: "14:00",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const { operationService } = await import("./operation.service");

    await assert.rejects(
      () => operationService.createRecurringImportBatch(COMPANY_ID, [buildMultiShiftBatchRow()]),
      /shift seed failed/,
    );

    assert.equal(transactionCommitted, false);
    assert.equal(transactionRollbackCalls, 1);
    assert.equal(createShiftIdentityCalls, 2);
    assert.equal(materializeCalls, 0);
  });
});
