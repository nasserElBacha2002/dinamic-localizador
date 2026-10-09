import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { operationRepository } from "../repositories/operation.repository";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { insertOperationalLocationFixture } from "../test-helpers/operational-location-fixture";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { operationService } from "./operation.service";

describeDatabaseIntegration("operation list cancelled filter", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let serviceId = "";
  let scheduledOperationId = "";
  let cancelledOperationId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const suffix = `${Date.now()}`;
    const pool = getPool();
    const company = await createPlatformCompanyFixture({
      name: `Op list filter ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `op-list-filter-${suffix}@integration.test` },
    });
    companyId = company.data.company.id;
    fixtures.trackCompany(companyId);

    serviceId = await insertOperationalLocationFixture({
      companyId,
      name: `Op list svc ${suffix}`,
      latitude: -34.6037,
      longitude: -58.3816,
    });

    const scheduledStart = new Date("2031-06-01T12:00:00.000Z");
    const scheduledEnd = new Date("2031-06-01T18:00:00.000Z");
    const insert = async (status: "SCHEDULED" | "CANCELLED") => {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("serviceId", sql.UniqueIdentifier, serviceId)
        .input("scheduledStart", sql.DateTime2, scheduledStart)
        .input("scheduledEnd", sql.DateTime2, scheduledEnd)
        .input("status", sql.NVarChar(30), status)
        .query(`
          INSERT INTO scheduled_operations (
            company_id, service_id, operation_kind, scheduled_start, scheduled_end,
            early_tolerance_minutes, late_tolerance_minutes, status
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd, 15, 15, @status
          )
        `);
      const operationId = String(result.recordset[0].id);
      fixtures.trackOperation(companyId, operationId);
      return operationId;
    };

    scheduledOperationId = await insert("SCHEDULED");
    cancelledOperationId = await insert("CANCELLED");
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("excludes CANCELLED when status filter is omitted (Estado Todos)", async () => {
    const { items, total } = await operationRepository.list(companyId, { page: 1, limit: 50 });
    const ids = new Set(items.map((item) => item.id));
    assert.equal(ids.has(scheduledOperationId), true);
    assert.equal(ids.has(cancelledOperationId), false);
    assert.equal(total, 1);
  });

  it("includes CANCELLED when filtering explicitly by CANCELLED status", async () => {
    const { items, total } = await operationRepository.list(companyId, {
      page: 1,
      limit: 50,
      status: "CANCELLED",
    });
    assert.equal(total, 1);
    assert.equal(items[0]?.id, cancelledOperationId);
  });

  it("operationService.list matches repository semantics for default query", async () => {
    const result = await operationService.list(companyId, { page: 1, limit: 50 });
    const ids = new Set(result.data.map((item) => item.id));
    assert.equal(ids.has(scheduledOperationId), true);
    assert.equal(ids.has(cancelledOperationId), false);
    assert.equal(result.meta.total, 1);
  });
});
