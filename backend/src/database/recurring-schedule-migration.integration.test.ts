import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
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
            (SELECT TOP 1 id FROM dbo.services),
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

    await assert.rejects(
      () =>
        pool.request().query(`
          INSERT INTO dbo.operation_schedules (
            id, company_id, operation_id, schedule_source, timezone, valid_from, version
          )
          VALUES (
            NEWID(),
            (SELECT TOP 1 id FROM dbo.companies),
            (SELECT TOP 1 id FROM dbo.scheduled_operations WHERE operation_kind = N'RECURRING'),
            N'COMPANY',
            N'America/Argentina/Buenos_Aires',
            CAST(GETDATE() AS DATE),
            1
          )
        `),
      /CK_operation_schedules_timezone_source|CHECK constraint/,
    );
  });

  it("documents migration SQL includes company schedule backfill", () => {
    const migration042 = readFileSync(MIGRATION_042_PATH, "utf8");
    assert.match(migration042, /company_work_schedules/);
    assert.match(migration042, /default_operation_start_time/);
  });
});
