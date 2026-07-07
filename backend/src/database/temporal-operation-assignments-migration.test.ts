import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("temporal operation assignments migration 040", () => {
  const migration = readFileSync(
    join(process.cwd(), "../database/migrations/040_temporal_operation_assignments.sql"),
    "utf8",
  );

  it("introduces stable assignment id and validity columns", () => {
    assert.match(migration, /ADD id UNIQUEIDENTIFIER/);
    assert.match(migration, /ADD valid_from DATE/);
    assert.match(migration, /ADD valid_until DATE/);
    assert.match(migration, /PK_operation_assignments PRIMARY KEY \(id\)/);
  });

  it("links employee workdays to assignment periods", () => {
    assert.match(migration, /employee_workdays.*operation_assignment_id/s);
    assert.match(migration, /FK_employee_workdays_operation_assignment/);
  });

  it("backfills validity using operation timezone helper", () => {
    assert.match(migration, /fn_resolve_operation_timezone_for_sql/);
    assert.match(migration, /valid_until = NULL/);
  });
});

describe("assignment cancellation migration 041", () => {
  const migration = readFileSync(
    join(process.cwd(), "../database/migrations/041_assignment_cancellation.sql"),
    "utf8",
  );

  it("adds cancelled_at audit column and supporting index", () => {
    assert.match(migration, /ADD cancelled_at DATETIME2 NULL/);
    assert.match(migration, /IX_operation_assignments_company_operation_cancelled/);
  });
});
