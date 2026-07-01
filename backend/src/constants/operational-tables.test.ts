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
} from "../constants/operational-tables";

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
  const migration = readFileSync(
    join(process.cwd(), "../database/migrations/021_physical_operational_table_rename.sql"),
    "utf8",
  );

  it("renames stores, inventories and inventory_employees", () => {
    assert.match(migration, /sp_rename 'dbo\.stores', 'operational_locations'/);
    assert.match(migration, /sp_rename 'dbo\.inventories', 'scheduled_operations'/);
    assert.match(migration, /sp_rename 'dbo\.inventory_employees', 'operation_assignments'/);
  });

  it("creates legacy compatibility views", () => {
    assert.match(migration, /CREATE VIEW dbo\.stores AS SELECT \* FROM dbo\.operational_locations/);
    assert.match(migration, /CREATE VIEW dbo\.inventories AS SELECT \* FROM dbo\.scheduled_operations/);
    assert.match(
      migration,
      /CREATE VIEW dbo\.inventory_employees AS SELECT \* FROM dbo\.operation_assignments/,
    );
  });

  it("documents rollback steps", () => {
    assert.match(migration, /Rollback/i);
    assert.match(migration, /DROP VIEW IF EXISTS dbo\.stores/);
  });
});
