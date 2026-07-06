import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("recurring schedule timezone semantics migration 043", () => {
  const migration = readFileSync(
    join(process.cwd(), "../database/migrations/043_recurring_schedule_timezone_semantics.sql"),
    "utf8",
  );

  it("makes COMPANY timezone nullable and adds source constraint", () => {
    assert.match(migration, /ALTER COLUMN timezone NVARCHAR\(80\) NULL/);
    assert.match(migration, /CK_operation_schedules_timezone_source/);
    assert.match(migration, /schedule_source = N'COMPANY' AND timezone IS NULL/);
    assert.match(migration, /schedule_source = N'CUSTOM' AND timezone IS NOT NULL/);
  });

  it("validates recurring schedule consistency", () => {
    assert.match(migration, /Migration 043: recurring operation without operation_schedules row/);
    assert.match(
      migration,
      /Migration 043: COMPANY operation schedule without company_work_schedules/,
    );
  });
});
