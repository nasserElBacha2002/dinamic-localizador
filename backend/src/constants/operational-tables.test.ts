import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LEGACY_INVENTORIES_VIEW,
  LEGACY_INVENTORY_EMPLOYEES_VIEW,
  LEGACY_STORES_VIEW,
  OPERATIONAL_LOCATIONS_TABLE,
  OPERATION_ASSIGNMENTS_TABLE,
  SCHEDULED_OPERATIONS_TABLE,
} from "./operational-tables";

const migrationPath = join(
  process.cwd(),
  "../database/migrations/021_physical_operational_table_rename.sql",
);

describe("operational table constants", () => {
  it("defines physical table names for Phase 2.7", () => {
    assert.equal(OPERATIONAL_LOCATIONS_TABLE, "operational_locations");
    assert.equal(SCHEDULED_OPERATIONS_TABLE, "scheduled_operations");
    assert.equal(OPERATION_ASSIGNMENTS_TABLE, "operation_assignments");
  });

  it("documents legacy compatibility view names", () => {
    assert.equal(LEGACY_STORES_VIEW, "stores");
    assert.equal(LEGACY_INVENTORIES_VIEW, "inventories");
    assert.equal(LEGACY_INVENTORY_EMPLOYEES_VIEW, "inventory_employees");
  });
});

describe("021_physical_operational_table_rename migration", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("does not hardcode database selection", () => {
    assert.doesNotMatch(migration, /\bUSE\s+dinamic_attendance\b/i);
  });

  it("documents migration runner GO batch support", () => {
    assert.match(migration, /run-migrations\.ts/i);
    assert.match(migration, /^\s*GO\s*$/im);
  });

  it("renames stores, inventories and inventory_employees", () => {
    assert.match(migration, /sp_rename\s+'dbo\.stores',\s+'operational_locations'/i);
    assert.match(migration, /sp_rename\s+'dbo\.inventories',\s+'scheduled_operations'/i);
    assert.match(migration, /sp_rename\s+'dbo\.inventory_employees',\s+'operation_assignments'/i);
  });

  it("creates legacy compatibility views via dynamic SQL", () => {
    assert.match(migration, /EXEC\(N'CREATE VIEW dbo\.stores/i);
    assert.match(migration, /EXEC\(N'CREATE VIEW dbo\.inventories/i);
    assert.match(migration, /EXEC\(N'CREATE VIEW dbo\.inventory_employees/i);
  });

  it("guards view creation when legacy names still exist as tables", () => {
    assert.match(migration, /OBJECT_ID\('dbo\.stores', 'U'\) IS NULL/);
    assert.match(migration, /OBJECT_ID\('dbo\.inventories', 'U'\) IS NULL/);
    assert.match(migration, /OBJECT_ID\('dbo\.inventory_employees', 'U'\) IS NULL/);
  });

  it("documents rollback steps without hardcoded database name", () => {
    assert.match(migration, /Rollback/i);
    assert.match(migration, /DROP VIEW dbo\.stores/i);
    assert.doesNotMatch(migration, /\bUSE\s+dinamic_attendance\b/i);
  });
});
