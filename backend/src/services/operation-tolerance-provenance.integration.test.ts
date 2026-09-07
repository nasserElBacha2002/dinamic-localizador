import assert from "node:assert/strict";
import { after, before, it, mock } from "node:test";
import sql from "mssql";
import { toCompanySettingsInput } from "../constants/company-settings";
import { WEEKDAYS } from "../constants/weekday";
import { getPool } from "../database/connection";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { insertOperationalLocationFixture } from "../test-helpers/operational-location-fixture";
import { companyService } from "./company.service";
import { operationImportService } from "./operation-import.service";
import { operationService } from "./operation.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";

describeDatabaseIntegration("operation tolerance provenance", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let serviceId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const company = await companyRepository.create({
      name: `Tolerance provenance ${Date.now()}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
    });
    companyId = company.id;
    fixtures.trackCompany(companyId);

    await companySettingsRepository.create(companyId, {
      ...toCompanySettingsInput(),
      defaultEarlyArrivalToleranceMinutes: 40,
      defaultLateArrivalToleranceMinutes: 20,
    });
    serviceId = await insertOperationalLocationFixture({
      companyId,
      name: "Tolerance provenance location",
      latitude: -34.6037,
      longitude: -58.3816,
    });
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const createRecurring = async (
    earlyToleranceMinutes?: number | null,
    lateToleranceMinutes?: number | null,
  ) => {
    const operation = await operationService.create(companyId, {
      operationKind: "RECURRING",
      serviceId,
      validFrom: new Date().toISOString().slice(0, 10),
      validUntil: null,
      scheduleSource: "CUSTOM",
      scheduleDays: WEEKDAYS.map((dayOfWeek) => ({
        dayOfWeek,
        isEnabled: true,
        startTime: "09:00",
        endTime: "17:00",
      })),
      ...(earlyToleranceMinutes !== undefined ? { earlyToleranceMinutes } : {}),
      ...(lateToleranceMinutes !== undefined ? { lateToleranceMinutes } : {}),
    });
    fixtures.trackOperation(companyId, operation.id);
    return operation;
  };

  const readOperationTolerances = async (operationId: string) => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT
          early_tolerance_minutes,
          late_tolerance_minutes,
          early_tolerance_source,
          late_tolerance_source
        FROM scheduled_operations
        WHERE company_id = @companyId AND id = @operationId
      `);
    return result.recordset[0] as Record<string, number | string>;
  };

  const readFutureWorkdayTolerances = async (operationId: string) => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT TOP 1 early_tolerance_minutes, late_tolerance_minutes
        FROM operation_workdays
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND status = N'ACTIVE'
          AND expected_start_at > SYSUTCDATETIME()
        ORDER BY expected_start_at
      `);
    assert.ok(result.recordset[0], "expected a future materialized workday");
    return result.recordset[0] as Record<string, number>;
  };

  it("defaults legacy inserts without source columns to CUSTOM", async () => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, new Date(Date.now() + 86_400_000))
      .query(`
        INSERT INTO scheduled_operations (
          company_id,
          service_id,
          operation_kind,
          scheduled_start,
          early_tolerance_minutes,
          late_tolerance_minutes
        )
        OUTPUT
          INSERTED.id,
          INSERTED.early_tolerance_source,
          INSERTED.late_tolerance_source
        VALUES (
          @companyId,
          @serviceId,
          N'ONE_TIME',
          @scheduledStart,
          40,
          20
        )
      `);

    const row = result.recordset[0] as {
      id: string;
      early_tolerance_source: string;
      late_tolerance_source: string;
    };
    fixtures.trackOperation(companyId, row.id);
    assert.equal(row.early_tolerance_source, "CUSTOM");
    assert.equal(row.late_tolerance_source, "CUSTOM");
  });

  it("propagates only changed company defaults to inherited recurring operations", async () => {
    const inherited = await createRecurring();
    const customEqualToDefault = await createRecurring(40, 20);
    const customZero = await createRecurring(0, 0);
    const mixed = await createRecurring(undefined, 7);

    assert.equal(inherited.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(inherited.lateToleranceSource, "COMPANY_DEFAULT");
    assert.equal(customEqualToDefault.earlyToleranceSource, "CUSTOM");
    assert.equal(customEqualToDefault.lateToleranceSource, "CUSTOM");
    assert.equal(customZero.earlyToleranceSource, "CUSTOM");
    assert.equal(customZero.lateToleranceSource, "CUSTOM");

    await companyService.updateSettings(companyId, "OWNER", {
      defaultEarlyArrivalToleranceMinutes: 50,
    });

    const inheritedAfterEarly = await readOperationTolerances(inherited.id);
    assert.equal(Number(inheritedAfterEarly.early_tolerance_minutes), 50);
    assert.equal(Number(inheritedAfterEarly.late_tolerance_minutes), 20);
    assert.equal(inheritedAfterEarly.early_tolerance_source, "COMPANY_DEFAULT");

    const customAfterEarly = await readOperationTolerances(customEqualToDefault.id);
    assert.equal(Number(customAfterEarly.early_tolerance_minutes), 40);
    assert.equal(Number(customAfterEarly.late_tolerance_minutes), 20);
    assert.equal(customAfterEarly.early_tolerance_source, "CUSTOM");

    const zeroAfterEarly = await readOperationTolerances(customZero.id);
    assert.equal(Number(zeroAfterEarly.early_tolerance_minutes), 0);
    assert.equal(Number(zeroAfterEarly.late_tolerance_minutes), 0);

    const mixedAfterEarly = await readOperationTolerances(mixed.id);
    assert.equal(Number(mixedAfterEarly.early_tolerance_minutes), 50);
    assert.equal(Number(mixedAfterEarly.late_tolerance_minutes), 7);

    const inheritedWorkdayAfterEarly = await readFutureWorkdayTolerances(inherited.id);
    assert.equal(Number(inheritedWorkdayAfterEarly.early_tolerance_minutes), 50);
    assert.equal(Number(inheritedWorkdayAfterEarly.late_tolerance_minutes), 20);

    await companyService.updateSettings(companyId, "OWNER", {
      defaultLateArrivalToleranceMinutes: 30,
    });

    const inheritedAfterLate = await readOperationTolerances(inherited.id);
    assert.equal(Number(inheritedAfterLate.early_tolerance_minutes), 50);
    assert.equal(Number(inheritedAfterLate.late_tolerance_minutes), 30);

    const mixedAfterLate = await readOperationTolerances(mixed.id);
    assert.equal(Number(mixedAfterLate.early_tolerance_minutes), 50);
    assert.equal(Number(mixedAfterLate.late_tolerance_minutes), 7);

    const inheritedWorkdayAfterLate = await readFutureWorkdayTolerances(inherited.id);
    assert.equal(Number(inheritedWorkdayAfterLate.early_tolerance_minutes), 50);
    assert.equal(Number(inheritedWorkdayAfterLate.late_tolerance_minutes), 30);
  });

  it("persists imported omitted, explicit, and zero tolerances with distinct provenance", async () => {
    await companyService.updateSettings(companyId, "OWNER", {
      defaultEarlyArrivalToleranceMinutes: 50,
      defaultLateArrivalToleranceMinutes: 30,
    });
    const baseStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    baseStart.setUTCHours(12, 0, 0, 0);
    const rows = [
      {
        serviceId,
        scheduledStart: baseStart.toISOString(),
        scheduledEnd: new Date(baseStart.getTime() + 8 * 60 * 60_000).toISOString(),
        earlyToleranceMinutes: 50,
        lateToleranceMinutes: 30,
        earlyToleranceSource: "COMPANY_DEFAULT" as const,
        lateToleranceSource: "COMPANY_DEFAULT" as const,
      },
      {
        serviceId,
        scheduledStart: new Date(baseStart.getTime() + 24 * 60 * 60_000).toISOString(),
        scheduledEnd: new Date(baseStart.getTime() + 32 * 60 * 60_000).toISOString(),
        earlyToleranceMinutes: 50,
        lateToleranceMinutes: 30,
        earlyToleranceSource: "CUSTOM" as const,
        lateToleranceSource: "CUSTOM" as const,
      },
      {
        serviceId,
        scheduledStart: new Date(baseStart.getTime() + 48 * 60 * 60_000).toISOString(),
        scheduledEnd: new Date(baseStart.getTime() + 56 * 60 * 60_000).toISOString(),
        earlyToleranceMinutes: 0,
        lateToleranceMinutes: 0,
        earlyToleranceSource: "CUSTOM" as const,
        lateToleranceSource: "CUSTOM" as const,
      },
    ];

    const result = await operationImportService.confirm(companyId, rows);
    for (const operation of result.data) {
      fixtures.trackOperation(companyId, operation.id);
    }

    assert.equal(result.data[0].earlyToleranceMinutes, 50);
    assert.equal(result.data[0].lateToleranceMinutes, 30);
    assert.equal(result.data[0].earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(result.data[0].lateToleranceSource, "COMPANY_DEFAULT");
    assert.equal(result.data[1].earlyToleranceSource, "CUSTOM");
    assert.equal(result.data[1].lateToleranceSource, "CUSTOM");
    assert.equal(result.data[2].earlyToleranceSource, "CUSTOM");
    assert.equal(result.data[2].lateToleranceSource, "CUSTOM");
  });

  it("keeps the committed override visible and converges on retry after materialization fails", async () => {
    const operation = await createRecurring();
    mock.method(
      recurringWorkdayMaterializationService,
      "materializeOperationHorizon",
      async () => {
        throw new Error("transient test failure");
      },
    );

    try {
      await assert.rejects(
        () =>
          operationService.update(companyId, operation.id, {
            earlyToleranceMinutes: 77,
          }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "RECURRING_WORKDAY_SYNC_FAILED",
      );
    } finally {
      mock.restoreAll();
    }

    const committed = await readOperationTolerances(operation.id);
    assert.equal(Number(committed.early_tolerance_minutes), 77);
    assert.equal(committed.early_tolerance_source, "CUSTOM");

    await recurringWorkdayMaterializationService.materializeOperationHorizon(
      companyId,
      operation.id,
    );
    const converged = await readFutureWorkdayTolerances(operation.id);
    assert.equal(Number(converged.early_tolerance_minutes), 77);
  });
});
