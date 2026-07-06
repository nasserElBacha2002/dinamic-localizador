import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("recurring schedule foundation migration 042", () => {
  const migration = readFileSync(
    join(process.cwd(), "../database/migrations/042_recurring_schedule_foundation.sql"),
    "utf8",
  );

  it("introduces company and operation schedule tables", () => {
    assert.match(migration, /CREATE TABLE dbo\.company_work_schedules/);
    assert.match(migration, /CREATE TABLE dbo\.company_work_schedule_days/);
    assert.match(migration, /CREATE TABLE dbo\.operation_schedules/);
    assert.match(migration, /CREATE TABLE dbo\.operation_schedule_days/);
  });

  it("allows nullable scheduled timestamps for recurring operations", () => {
    assert.match(migration, /ALTER COLUMN scheduled_start DATETIME2 NULL/);
    assert.match(migration, /operation_kind = N'RECURRING'/);
  });

  it("backfills company weekly schedule from operational defaults", () => {
    assert.match(migration, /default_operation_start_time/);
    assert.match(migration, /day_of_week/);
    assert.match(migration, /is_enabled/);
  });
});
