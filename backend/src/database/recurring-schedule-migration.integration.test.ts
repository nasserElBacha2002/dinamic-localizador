import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "./connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

const MIGRATION_042_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/042_recurring_schedule_foundation.sql",
);

const MIGRATION_043_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/043_recurring_schedule_timezone_semantics.sql",
);

describeDatabaseIntegration("recurring schedule migrations 042/043", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("has recurring schedule tables after migrations", async () => {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        OBJECT_ID(N'dbo.company_work_schedules') AS company_schedules,
        OBJECT_ID(N'dbo.company_work_schedule_days') AS company_days,
        OBJECT_ID(N'dbo.operation_schedules') AS operation_schedules,
        OBJECT_ID(N'dbo.operation_schedule_days') AS operation_days
    `);

    const row = result.recordset[0];
    assert.ok(row.company_schedules);
    assert.ok(row.company_days);
    assert.ok(row.operation_schedules);
    assert.ok(row.operation_days);
  });

  it("rejects ONE_TIME operations without scheduled_start", async () => {
    const pool = getPool();
    await assert.rejects(
      () =>
        pool.request().query(`
          INSERT INTO dbo.scheduled_operations (
            id, company_id, service_id, operation_kind, scheduled_start, scheduled_end, status
          )
          VALUES (
            NEWID(),
            (SELECT TOP 1 id FROM dbo.companies),
            (SELECT TOP 1 id FROM dbo.operational_locations),
            N'ONE_TIME',
            NULL,
            NULL,
            N'SCHEDULED'
          )
        `),
      /CK_scheduled_operations_one_time_schedule|CHECK constraint/,
    );
  });

  it("enforces COMPANY timezone nullability when constraint 043 is applied", async () => {
    const pool = getPool();
    const migration043 = readFileSync(MIGRATION_043_PATH, "utf8");
    if (!migration043.includes("CK_operation_schedules_timezone_source")) {
      return;
    }

    const applied = await pool.request().query(`
      SELECT 1 AS present
      FROM sys.check_constraints
      WHERE name = N'CK_operation_schedules_timezone_source'
    `);

    if (!applied.recordset[0]?.present) {
      return;
    }

    const targetOperation = await pool.request().query(`
      SELECT TOP 1
        o.id AS operation_id,
        o.company_id
      FROM dbo.scheduled_operations o
      WHERE o.operation_kind = N'RECURRING'
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.operation_schedules os
          WHERE os.operation_id = o.id
        )
      ORDER BY o.created_at DESC
    `);

    let operationId = targetOperation.recordset[0]?.operation_id
      ? String(targetOperation.recordset[0].operation_id)
      : "";
    let companyId = targetOperation.recordset[0]?.company_id
      ? String(targetOperation.recordset[0].company_id)
      : "";
    let seededOperation = false;

    if (!operationId) {
      const seeded = await pool.request().query(`
        DECLARE @companyId UNIQUEIDENTIFIER = (SELECT TOP 1 id FROM dbo.companies ORDER BY created_at ASC);
        DECLARE @serviceId UNIQUEIDENTIFIER = (
          SELECT TOP 1 id
          FROM dbo.operational_locations
          WHERE company_id = @companyId
          ORDER BY created_at ASC
        );
        DECLARE @operationId UNIQUEIDENTIFIER = NEWID();

        INSERT INTO dbo.scheduled_operations (
          id, company_id, service_id, operation_kind, status
        )
        VALUES (@operationId, @companyId, @serviceId, N'RECURRING', N'SCHEDULED');

        SELECT @operationId AS operation_id, @companyId AS company_id;
      `);
      operationId = String(seeded.recordset[0]?.operation_id ?? "");
      companyId = String(seeded.recordset[0]?.company_id ?? "");
      seededOperation = true;
    }

    assert.ok(operationId);
    assert.ok(companyId);

    try {
      await assert.rejects(
        () =>
          pool
            .request()
            .input("companyId", sql.UniqueIdentifier, companyId)
            .input("operationId", sql.UniqueIdentifier, operationId)
            .query(`
              INSERT INTO dbo.operation_schedules (
                id, company_id, operation_id, schedule_source, timezone, valid_from, version
              )
              VALUES (
                NEWID(),
                @companyId,
                @operationId,
                N'COMPANY',
                N'America/Argentina/Buenos_Aires',
                CAST(GETDATE() AS DATE),
                1
              )
            `),
        /CK_operation_schedules_timezone_source|CHECK constraint/,
      );
    } finally {
      if (seededOperation) {
        await pool
          .request()
          .input("operationId", sql.UniqueIdentifier, operationId)
          .query(`
            DELETE FROM dbo.operation_schedules WHERE operation_id = @operationId;
            DELETE FROM dbo.scheduled_operations WHERE id = @operationId;
          `);
      }
    }
  });

  it("documents migration SQL includes company schedule backfill", () => {
    const migration042 = readFileSync(MIGRATION_042_PATH, "utf8");
    assert.match(migration042, /company_work_schedules/);
    assert.match(migration042, /default_operation_start_time/);
  });
});
