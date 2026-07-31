import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { operationService } from "./operation.service";

/**
 * Real SQL concurrency evidence for ONE_TIME schedule writers.
 * Requires RUN_DB_INTEGRATION_TESTS=true and a reachable SQL Server.
 */
describeDatabaseIntegration("ONE_TIME schedule concurrency", () => {
  const fixtures = createIntegrationFixtureTracker();

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("concurrent A→B and A→C updates leave one coherent workday", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const serviceResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(serviceResult.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const startA = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
    startA.setUTCHours(23, 30, 0, 0);
    const endA = new Date(startA.getTime() + 6 * 60 * 60 * 1000);
    const startB = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000);
    startB.setUTCHours(23, 30, 0, 0);
    const endB = new Date(startB.getTime() + 6 * 60 * 60 * 1000);
    const startC = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
    startC.setUTCHours(23, 30, 0, 0);
    const endC = new Date(startC.getTime() + 6 * 60 * 60 * 1000);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, startA)
      .input("scheduledEnd", sql.DateTime2, endA)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, 90, 'SCHEDULED'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("scheduledStart", sql.DateTime2, startA)
      .input("scheduledEnd", sql.DateTime2, endA)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        VALUES (
          @companyId, @operationId, CAST(@scheduledStart AS DATE),
          @scheduledStart, @scheduledEnd, 60, 90, 1, 'ACTIVE'
        )
      `);

    const results = await Promise.allSettled([
      operationService.update(companyId, operationId, {
        scheduledStart: startB.toISOString(),
        scheduledEnd: endB.toISOString(),
      }),
      operationService.update(companyId, operationId, {
        scheduledStart: startC.toISOString(),
        scheduledEnd: endC.toISOString(),
      }),
    ]);

    const fulfilled = results.filter((row) => row.status === "fulfilled");
    assert.ok(fulfilled.length >= 1);

    const workdays = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT expected_start_at, expected_end_at, schedule_version
        FROM operation_workdays
        WHERE company_id = @companyId AND operation_id = @operationId
      `);
    assert.equal(workdays.recordset.length, 1);

    const operation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT scheduled_start, scheduled_end
        FROM scheduled_operations
        WHERE company_id = @companyId AND id = @operationId
      `);

    assert.equal(
      new Date(workdays.recordset[0].expected_start_at).toISOString(),
      new Date(operation.recordset[0].scheduled_start).toISOString(),
    );
    assert.equal(
      new Date(workdays.recordset[0].expected_end_at).toISOString(),
      new Date(operation.recordset[0].scheduled_end).toISOString(),
    );
    assert.ok(Number(workdays.recordset[0].schedule_version) >= 2);
  });
});
