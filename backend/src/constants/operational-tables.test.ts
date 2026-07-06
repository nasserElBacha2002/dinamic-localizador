import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  OPERATIONAL_LOCATIONS_TABLE,
  OPERATION_ASSIGNMENTS_TABLE,
  SCHEDULED_OPERATIONS_TABLE,
} from "./operational-tables";

const migration021Path = join(
  process.cwd(),
  "../database/migrations/021_physical_operational_table_rename.sql",
);

const migration037Path = join(
  process.cwd(),
  "../database/migrations/037_domain_rename_completion.sql",
);

describe("operational table constants", () => {
  it("defines physical table names for Phase 2.7", () => {
    assert.equal(OPERATIONAL_LOCATIONS_TABLE, "operational_locations");
    assert.equal(SCHEDULED_OPERATIONS_TABLE, "scheduled_operations");
    assert.equal(OPERATION_ASSIGNMENTS_TABLE, "operation_assignments");
  });
});

describe("021_physical_operational_table_rename migration", () => {
  const migration = readFileSync(migration021Path, "utf8");

  it("does not hardcode database selection", () => {
    assert.doesNotMatch(migration, /\bUSE\s+dinamic_attendance\b/i);
  });

  it("documents migration runner GO batch support", () => {
    assert.match(migration, /run-migrations\.ts/i);
    assert.match(migration, /^\s*GO\s*$/im);
  });

  it("renames legacy operational tables to physical names", () => {
    assert.match(migration, /sp_rename\s+'dbo\.stores',\s+'operational_locations'/i);
    assert.match(migration, /sp_rename\s+'dbo\.inventories',\s+'scheduled_operations'/i);
    assert.match(migration, /sp_rename\s+'dbo\.inventory_employees',\s+'operation_assignments'/i);
  });

  it("documents rollback steps without hardcoded database name", () => {
    assert.match(migration, /Rollback/i);
    assert.doesNotMatch(migration, /\bUSE\s+dinamic_attendance\b/i);
  });
});

describe("037_domain_rename_completion migration", () => {
  const migration = readFileSync(migration037Path, "utf8");

  it("migrates company_modules key to operations", () => {
    assert.match(migration, /inventory_operations/);
    assert.match(migration, /module_key = N'operations'/);
  });

  it("drops hollow legacy compatibility views", () => {
    assert.match(migration, /DROP VIEW dbo\.inventory_employees/i);
    assert.match(migration, /DROP VIEW dbo\.inventories/i);
    assert.match(migration, /DROP VIEW dbo\.stores/i);
  });
});
