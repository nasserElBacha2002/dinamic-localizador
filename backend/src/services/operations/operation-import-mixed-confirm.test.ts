import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { WEEKDAYS } from "../../constants/weekday";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../../constants/company-settings";
import { setTestPool } from "../../database/connection";
import { companyOperationalDefaultsResolver } from "../companies/company-operational-defaults.resolver";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { companyWorkScheduleRepository } from "../../repositories/companies/company-work-schedule.repository";
import { operationRepository } from "../../repositories/operations/operation.repository";
import { operationScheduleRepository } from "../../repositories/operations/operation-schedule.repository";
import { operationShiftRepository } from "../../repositories/operations/operation-shift.repository";
import { operationShiftVersionRepository } from "../../repositories/operations/operation-shift-version.repository";
import { serviceRepository } from "../../repositories/locations/service.repository";
import { recurringWorkdayMaterializationService } from "../workdays/recurring-workday-materialization.service";
import { recurringWorkdaySyncService } from "../workdays/recurring-workday-sync.service";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import { operationImportService } from "./operation-import.service";

const COMPANY_ID = "company-mixed-import";
const SERVICE_ID = "service-213";

const sampleService = {
  id: SERVICE_ID,
  name: "213",
  address: "Calle 1",
  neighborhood: null,
  locality: null,
  serviceFormat: null,
  latitude: -34.6,
  longitude: -58.38,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const defaultImportDefaults = {
  companyId: COMPANY_ID,
  earlyToleranceMinutes: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
  lateToleranceMinutes: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultLateArrivalToleranceMinutes,
  operationTimezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
  defaultOperationStartTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationStartTime,
  defaultOperationEndTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationEndTime,
  geofenceReviewMarginMeters: 30,
  source: "operational_defaults" as const,
  timezoneSource: "operational_defaults" as const,
  geofenceReviewMarginSource: "environment" as const,
};

const customScheduleDays = WEEKDAYS.map((dayOfWeek, index) => ({
  dayOfWeek,
  isEnabled: index < 5,
  startTime: "09:00",
  endTime: "18:00",
}));

const shiftDays = [{ dayOfWeek: 1, isEnabled: true }];

describe("operationImportService mixed canonical confirm", () => {
  const restores: Array<() => void> = [];
  let transactionCommitted = false;
  let transactionRollbackCalls = 0;
  let createManyCalls = 0;
  let createShiftIdentityCalls = 0;
  let materializeCalls = 0;

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
    transactionCommitted = false;
    transactionRollbackCalls = 0;
    createManyCalls = 0;
    createShiftIdentityCalls = 0;
    materializeCalls = 0;
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

  const mockSharedConfirmContext = (options: { withCompanySchedule?: boolean } = {}) => {
    setupUnitTestEnv();
    setTestPool({ connected: true } as sql.ConnectionPool);
    patchTransaction();

    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => defaultImportDefaults);
    mock.method(operationRepository, "findExistingActiveKeys", async () => new Set());
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () =>
      options.withCompanySchedule
        ? {
            id: "schedule-1",
            companyId: COMPANY_ID,
            timezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
            days: customScheduleDays,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : null,
    );
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
    }));
    mock.method(operationScheduleRepository, "createInTransaction", async () => ({
      id: "schedule-1",
      companyId: COMPANY_ID,
      operationId: "operation-recurring",
      scheduleSource: "COMPANY",
      timezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
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

  it("rolls back mixed PUNTUAL + MULTI_TURNO when second shift seed fails", async () => {
    mockSharedConfirmContext({ withCompanySchedule: true });

    mock.method(operationRepository, "createManyInTransaction", async () => {
      createManyCalls += 1;
      return [
        {
          id: "operation-one-time",
          serviceId: SERVICE_ID,
          operationKind: "ONE_TIME",
          scheduledStart: "2026-12-01T23:30:00.000Z",
          scheduledEnd: "2026-12-02T06:00:00.000Z",
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 15,
          earlyToleranceSource: "COMPANY_DEFAULT",
          lateToleranceSource: "COMPANY_DEFAULT",
          status: "SCHEDULED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    mock.method(operationRepository, "createRecurring", async () => {
      return {
        id: "operation-recurring",
        serviceId: SERVICE_ID,
        operationKind: "RECURRING",
        scheduleMode: "MULTI_SHIFT",
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

    mock.method(operationShiftRepository, "createIdentityInTransaction", async () => {
      createShiftIdentityCalls += 1;
      if (createShiftIdentityCalls === 2) {
        throw new Error("shift seed failed");
      }
      return {
        id: `shift-${createShiftIdentityCalls}`,
        companyId: COMPANY_ID,
        operationId: "operation-recurring",
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

    await assert.rejects(
      () =>
        operationImportService.confirm(COMPANY_ID, [
          {
            serviceId: SERVICE_ID,
            scheduledStart: "2026-12-01T23:30:00.000Z",
            scheduledEnd: "2026-12-02T06:00:00.000Z",
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
          },
          {
            operationKind: "RECURRING",
            scheduleMode: "MULTI_SHIFT",
            multiShiftGroupKey: `${SERVICE_ID}|2026-12-01|MULTI_SHIFT`,
            serviceId: SERVICE_ID,
            validFrom: "2026-12-01",
            validUntil: null,
            scheduleSource: "COMPANY",
            shift: {
              code: "MANANA",
              name: "Mañana",
              startTime: "06:00",
              endTime: "14:00",
              days: shiftDays,
            },
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
          },
          {
            operationKind: "RECURRING",
            scheduleMode: "MULTI_SHIFT",
            multiShiftGroupKey: `${SERVICE_ID}|2026-12-01|MULTI_SHIFT`,
            serviceId: SERVICE_ID,
            validFrom: "2026-12-01",
            validUntil: null,
            scheduleSource: "COMPANY",
            shift: {
              code: "TARDE",
              name: "Tarde",
              startTime: "14:00",
              endTime: "22:00",
              days: shiftDays,
            },
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
          },
        ]),
      /shift seed failed/,
    );

    assert.equal(transactionCommitted, false);
    assert.equal(transactionRollbackCalls, 1);
    assert.equal(createManyCalls, 1);
    assert.equal(createShiftIdentityCalls, 2);
    assert.equal(materializeCalls, 0);
  });

  it("commits mixed PUNTUAL, FIJA and MULTI_TURNO in one transaction", async () => {
    mockSharedConfirmContext({ withCompanySchedule: true });

    const OriginalRequest = sql.Request;
    class FakeRequest {
      input() {
        return this;
      }

      async query() {
        return { rowsAffected: [1], recordset: [] };
      }
    }
    (sql as { Request: typeof sql.Request }).Request = FakeRequest as unknown as typeof sql.Request;
    restores.push(() => {
      (sql as { Request: typeof sql.Request }).Request = OriginalRequest;
    });

    mock.method(operationRepository, "createManyInTransaction", async () => {
      createManyCalls += 1;
      return [
        {
          id: "operation-one-time",
          serviceId: SERVICE_ID,
          operationKind: "ONE_TIME",
          scheduledStart: "2026-12-01T23:30:00.000Z",
          scheduledEnd: "2026-12-02T06:00:00.000Z",
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 15,
          earlyToleranceSource: "COMPANY_DEFAULT",
          lateToleranceSource: "COMPANY_DEFAULT",
          status: "SCHEDULED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });

    let recurringCreates = 0;
    mock.method(operationRepository, "createRecurring", async () => {
      recurringCreates += 1;
      return {
        id: `operation-recurring-${recurringCreates}`,
        serviceId: SERVICE_ID,
        operationKind: "RECURRING",
        scheduleMode: recurringCreates === 1 ? "SINGLE" : "MULTI_SHIFT",
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

    mock.method(operationShiftRepository, "createIdentityInTransaction", async () => ({
      id: `shift-${createShiftIdentityCalls += 1}`,
      companyId: COMPANY_ID,
      operationId: "operation-recurring-2",
      templateId: null,
      code: "MANANA",
      name: "Mañana",
      sortOrder: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

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

    const result = await operationImportService.confirm(COMPANY_ID, [
      {
        serviceId: SERVICE_ID,
        scheduledStart: "2026-12-01T23:30:00.000Z",
        scheduledEnd: "2026-12-02T06:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        earlyToleranceSource: "COMPANY_DEFAULT",
        lateToleranceSource: "COMPANY_DEFAULT",
      },
      {
        operationKind: "RECURRING",
        scheduleMode: "SINGLE",
        serviceId: SERVICE_ID,
        validFrom: "2026-12-10",
        validUntil: null,
        scheduleSource: "COMPANY",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        earlyToleranceSource: "COMPANY_DEFAULT",
        lateToleranceSource: "COMPANY_DEFAULT",
      },
      {
        operationKind: "RECURRING",
        scheduleMode: "MULTI_SHIFT",
        multiShiftGroupKey: `${SERVICE_ID}|2026-12-20|MULTI_SHIFT`,
        serviceId: SERVICE_ID,
        validFrom: "2026-12-20",
        validUntil: null,
        scheduleSource: "COMPANY",
        shift: {
          code: "MANANA",
          name: "Mañana",
          startTime: "06:00",
          endTime: "14:00",
          days: shiftDays,
        },
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        earlyToleranceSource: "COMPANY_DEFAULT",
        lateToleranceSource: "COMPANY_DEFAULT",
      },
      {
        operationKind: "RECURRING",
        scheduleMode: "MULTI_SHIFT",
        multiShiftGroupKey: `${SERVICE_ID}|2026-12-20|MULTI_SHIFT`,
        serviceId: SERVICE_ID,
        validFrom: "2026-12-20",
        validUntil: null,
        scheduleSource: "COMPANY",
        shift: {
          code: "TARDE",
          name: "Tarde",
          startTime: "14:00",
          endTime: "22:00",
          days: shiftDays,
        },
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        earlyToleranceSource: "COMPANY_DEFAULT",
        lateToleranceSource: "COMPANY_DEFAULT",
      },
    ]);

    assert.equal(result.count, 3);
    assert.equal(result.data.length, 3);
    assert.equal(transactionCommitted, true);
    assert.equal(transactionRollbackCalls, 0);
    assert.equal(createManyCalls, 1);
    assert.equal(recurringCreates, 2);
    assert.equal(materializeCalls, 2);
  });

  it("does not rollback mixed batch when post-commit materialization throws unexpected error", async () => {
    mockSharedConfirmContext({ withCompanySchedule: true });

    mock.method(operationRepository, "createManyInTransaction", async () => [
      {
        id: "operation-one-time",
        serviceId: SERVICE_ID,
        operationKind: "ONE_TIME",
        scheduledStart: "2026-12-01T23:30:00.000Z",
        scheduledEnd: "2026-12-02T06:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        earlyToleranceSource: "COMPANY_DEFAULT",
        lateToleranceSource: "COMPANY_DEFAULT",
        status: "SCHEDULED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    mock.method(operationRepository, "createRecurring", async () => ({
      id: "operation-recurring",
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

    mock.method(recurringWorkdaySyncService, "runOperationSync", async () => {
      throw new Error("unexpected mixed materialization failure");
    });

    await assert.rejects(
      () =>
        operationImportService.confirm(COMPANY_ID, [
          {
            serviceId: SERVICE_ID,
            scheduledStart: "2026-12-01T23:30:00.000Z",
            scheduledEnd: "2026-12-02T06:00:00.000Z",
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
          },
          {
            operationKind: "RECURRING",
            scheduleMode: "SINGLE",
            serviceId: SERVICE_ID,
            validFrom: "2026-12-10",
            validUntil: null,
            scheduleSource: "COMPANY",
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
          },
        ]),
      /unexpected mixed materialization failure/,
    );

    assert.equal(transactionCommitted, true);
    assert.equal(transactionRollbackCalls, 0);
    assert.equal(materializeCalls, 0);
  });
});
