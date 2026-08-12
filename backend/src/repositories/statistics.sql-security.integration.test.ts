import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { getPool } from "../database/connection";
import { statisticsRepository } from "../repositories/statistics.repository";
import type { StatisticsFilters } from "../schemas/statistics.schema";

const uniqueCompanyName = (): string =>
  `Stats SQL ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("statistics repository SQL parameter binding", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM company_work_schedule_days WHERE company_id = @companyId;
        DELETE FROM company_work_schedules WHERE company_id = @companyId;
        DELETE FROM company_calendar_dates WHERE company_id = @companyId;
        DELETE FROM company_work_calendar_weekdays WHERE company_id = @companyId;
        DELETE FROM company_work_calendars WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        DELETE FROM user_invitations WHERE company_id = @companyId;
        DELETE FROM audit_logs WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }
    await teardownDatabaseIntegration();
  });

  const seedCompany = async (): Promise<string> => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Stats Owner",
        email: `stats-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);
    return companyId;
  };

  it("getByOperation binds @referenceAt/@minSample for low_coverage and incompleteCoverage", async () => {
    const companyId = await seedCompany();
    const referenceAt = new Date("2026-08-12T15:00:00.000Z");
    const base: StatisticsFilters = {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    };

    const lowCoverage = await statisticsRepository.getByOperation(
      companyId,
      { ...base, rankingMode: "low_coverage_operations" },
      1,
      20,
      undefined,
      "desc",
      referenceAt,
    );
    assert.equal(typeof lowCoverage.total, "number");
    assert.ok(Array.isArray(lowCoverage.data));

    const incomplete = await statisticsRepository.getByOperation(
      companyId,
      { ...base, incompleteCoverage: true },
      1,
      20,
      undefined,
      "desc",
      referenceAt,
    );
    assert.equal(typeof incomplete.total, "number");
    assert.ok(Array.isArray(incomplete.data));
  });

  it("getByService binds @minSample for incident_services ranking", async () => {
    const companyId = await seedCompany();
    const referenceAt = new Date("2026-08-12T15:00:00.000Z");
    const result = await statisticsRepository.getByService(
      companyId,
      {
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        rankingMode: "incident_services",
      },
      1,
      20,
      undefined,
      "desc",
      referenceAt,
    );
    assert.equal(typeof result.total, "number");
    assert.ok(Array.isArray(result.data));
  });
});
