import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("workday domain migration 039", () => {
  const migration = readFileSync(
    join(process.cwd(), "../database/migrations/039_workday_domain_foundation.sql"),
    "utf8",
  );

  it("maps IANA timezones to SQL Server AT TIME ZONE names", () => {
    assert.match(migration, /fn_resolve_operation_timezone_for_sql/);
    assert.match(migration, /Argentina Standard Time/);
    assert.doesNotMatch(
      migration,
      /AT TIME ZONE\s+COALESCE\([\s\S]*America\/Argentina\/Buenos_Aires/,
    );
  });

  it("uses canonical timezone fallback instead of UTC", () => {
    assert.match(migration, /N'America\/Argentina\/Buenos_Aires'/);
    assert.doesNotMatch(migration, /COALESCE\([^\)]*N'UTC'\)/);
  });

  it("validates ONE_TIME single workday invariant", () => {
    assert.match(migration, /ONE_TIME operation has multiple operation_workdays after backfill/);
  });

  it("defines separate real and simulation attendance unique indexes", () => {
    assert.match(migration, /UX_attendance_records_employee_workday_active_real/);
    assert.match(migration, /UX_attendance_records_employee_workday_active_simulation/);
    assert.match(migration, /is_simulation = 0/);
    assert.match(migration, /simulation_session_id/);
  });

  it("validates attendance linkage before dropping legacy unique index", () => {
    const dropLegacyIndex = migration.indexOf("DROP INDEX UX_attendance_records_operation_employee_active");
    const validateLinkage = migration.indexOf(
      "Active attendance records without employee_workday_id remain after backfill",
    );
    assert.ok(validateLinkage > 0);
    assert.ok(dropLegacyIndex > validateLinkage);
  });

  it("does not persist redundant employee_workdays.operation_id in create table", () => {
    const createEmployeeWorkdays = migration.match(
      /CREATE TABLE dbo\.employee_workdays \([\s\S]*?\);/,
    )?.[0];
    assert.ok(createEmployeeWorkdays);
    assert.doesNotMatch(createEmployeeWorkdays, /operation_id/);
  });
});
