/**
 * Phase 3 corrections — migration runner, 092/093 ONE_TIME unique, rollback.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { applySqlScriptInTransaction } from "../database/run-migrations";
import { isActiveOperationDuplicateError } from "../utils/active-operation-duplicate-errors";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const readMigration = (name: string): string =>
  readFileSync(join(migrationsDir, name), "utf8");

const readRollback = (name: string): string =>
  readFileSync(join(migrationsDir, "rollback", name), "utf8");

const indexFilter = async (): Promise<string | null> => {
  const result = await getPool().request().query(`
    SELECT filter_definition
    FROM sys.indexes
    WHERE name = N'UQ_scheduled_operations_active_service_start'
      AND object_id = OBJECT_ID(N'dbo.scheduled_operations')
  `);
  const filter = result.recordset[0]?.filter_definition;
  return filter == null ? null : String(filter);
};

describeDatabaseIntegration("phase3 migration 092/093 concurrency unique", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("089–093 are registered in system_migrations via runner path", async () => {
    const result = await getPool().request().query(`
      SELECT migration_name
      FROM system_migrations
      WHERE migration_name IN (
        N'089_phase3_4_db_security_roles.sql',
        N'090_phase3_4_revoke_schema_execute.sql',
        N'091_operation_assignment_whatsapp_notifications.sql',
        N'092_phase3_scheduled_operations_active_unique.sql',
        N'093_phase3_scheduled_operations_active_unique_onetime.sql'
      )
      ORDER BY migration_name
    `);
    assert.equal(result.recordset.length, 5);
  });

  it("active unique index is ONE_TIME-scoped", async () => {
    const filter = await indexFilter();
    assert.ok(filter);
    assert.match(filter!, /ONE_TIME/);
    assert.match(filter!, /CANCELLED/);
    assert.match(filter!, /scheduled_start/);
  });

  it("rollback 093/092 removes index; reapply 092+093 restores ONE_TIME index", async () => {
    const pool = getPool();
    assert.ok(await indexFilter());

    await applySqlScriptInTransaction(
      pool,
      readRollback("093_phase3_scheduled_operations_active_unique_onetime_rollback.sql"),
    );
    // 092 rollback also drops the same index name — ensure absent
    await applySqlScriptInTransaction(
      pool,
      readRollback("092_phase3_scheduled_operations_active_unique_rollback.sql"),
    );
    assert.equal(await indexFilter(), null);

    await applySqlScriptInTransaction(
      pool,
      readMigration("092_phase3_scheduled_operations_active_unique.sql"),
    );
    await applySqlScriptInTransaction(
      pool,
      readMigration("093_phase3_scheduled_operations_active_unique_onetime.sql"),
    );

    const filter = await indexFilter();
    assert.ok(filter);
    assert.match(filter!, /ONE_TIME/);
  });

  it("CANCELLED ONE_TIME does not block a new active ONE_TIME at same start", async () => {
    const pool = getPool();
    const company = await pool.request().query(`
      SELECT TOP 1 id FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END, created_at ASC
    `);
    const companyId = String(company.recordset[0].id);
    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
      `);
    const serviceId = String(service.recordset[0].id);
    const start = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

    const cancelled = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          15, 15, N'CANCELLED'
        )
      `);
    const cancelledId = String(cancelled.recordset[0].id);

    const active = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          15, 15, N'SCHEDULED'
        )
      `);
    const activeId = String(active.recordset[0].id);

    await pool
      .request()
      .input("a", sql.UniqueIdentifier, cancelledId)
      .input("b", sql.UniqueIdentifier, activeId)
      .query(`DELETE FROM scheduled_operations WHERE id IN (@a, @b)`);
  });

  it("two RECURRING with NULL scheduled_start are allowed by the ONE_TIME unique", async () => {
    const pool = getPool();
    const company = await pool.request().query(`
      SELECT TOP 1 id FROM companies
      ORDER BY CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END, created_at ASC
    `);
    const companyId = String(company.recordset[0].id);
    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations WHERE company_id = @companyId AND active = 1
      `);
    const serviceId = String(service.recordset[0].id);

    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const inserted = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("serviceId", sql.UniqueIdentifier, serviceId)
        .query(`
          INSERT INTO scheduled_operations (
            company_id, service_id, operation_kind, scheduled_start, scheduled_end,
            early_tolerance_minutes, late_tolerance_minutes, status
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @serviceId, N'RECURRING', NULL, NULL, 15, 15, N'SCHEDULED'
          )
        `);
      ids.push(String(inserted.recordset[0].id));
    }
    assert.equal(ids.length, 2);
    await pool
      .request()
      .input("a", sql.UniqueIdentifier, ids[0])
      .input("b", sql.UniqueIdentifier, ids[1])
      .query(`DELETE FROM scheduled_operations WHERE id IN (@a, @b)`);
  });

  it("duplicate active ONE_TIME maps to isActiveOperationDuplicateError", async () => {
    const pool = getPool();
    const company = await pool.request().query(`
      SELECT TOP 1 id FROM companies
      ORDER BY CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END, created_at ASC
    `);
    const companyId = String(company.recordset[0].id);
    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations WHERE company_id = @companyId AND active = 1
      `);
    const serviceId = String(service.recordset[0].id);
    const start = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
    start.setUTCHours(11, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

    const first = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          15, 15, N'SCHEDULED'
        )
      `);
    const firstId = String(first.recordset[0].id);

    let duplicateError: unknown;
    try {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("serviceId", sql.UniqueIdentifier, serviceId)
        .input("scheduledStart", sql.DateTime2, start)
        .input("scheduledEnd", sql.DateTime2, end)
        .query(`
          INSERT INTO scheduled_operations (
            company_id, service_id, operation_kind, scheduled_start, scheduled_end,
            early_tolerance_minutes, late_tolerance_minutes, status
          )
          VALUES (
            @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
            15, 15, N'SCHEDULED'
          )
        `);
    } catch (error) {
      duplicateError = error;
    }

    assert.ok(isActiveOperationDuplicateError(duplicateError));
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, firstId)
      .query(`DELETE FROM scheduled_operations WHERE id = @id`);
  });
});
