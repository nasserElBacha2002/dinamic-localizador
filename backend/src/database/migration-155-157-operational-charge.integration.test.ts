/**
 * Migrations 155–157 — Encargado operativo phase 1 schema safety.
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
import { getPool } from "./connection";
import { applySqlScriptInTransaction } from "./run-migrations";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const readMigration = (name: string): string =>
  readFileSync(join(migrationsDir, name), "utf8");

const readRollback = (name: string): string =>
  readFileSync(join(migrationsDir, "rollback", name), "utf8");

const tableColumnExists = async (table: string, column: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("table", sql.NVarChar(256), table)
    .input("column", sql.NVarChar(128), column)
    .query(`
      SELECT COL_LENGTH(@table, @column) AS len
    `);
  return result.recordset[0]?.len != null;
};

const extendedPropertyExists = async (table: string, property: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("table", sql.NVarChar(128), table)
    .input("property", sql.NVarChar(128), property)
    .query(`
      SELECT COUNT(*) AS total
      FROM sys.extended_properties ep
      INNER JOIN sys.tables t ON ep.major_id = t.object_id
      WHERE ep.name = @property
        AND t.name = @table
        AND SCHEMA_NAME(t.schema_id) = N'dbo'
    `);
  return Number(result.recordset[0]?.total ?? 0) > 0;
};

describeDatabaseIntegration("migrations 155-157 operational charge holder", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("156 rollback is a no-op when replacement columns were created by 155", async () => {
    assert.equal(
      await tableColumnExists("dbo.company_user_employee_links", "previous_employee_id"),
      true,
    );
    const markerBefore = await extendedPropertyExists(
      "company_user_employee_links",
      "migration_156_added_replacement_columns",
    );

    await applySqlScriptInTransaction(
      getPool(),
      readRollback("156_company_user_employee_link_replacement_columns_rollback.sql"),
    );

    assert.equal(
      await tableColumnExists("dbo.company_user_employee_links", "previous_employee_id"),
      true,
      "rollback 156 must not drop columns introduced by migration 155",
    );
    assert.equal(
      await extendedPropertyExists(
        "company_user_employee_links",
        "migration_156_added_replacement_columns",
      ),
      markerBefore,
    );
  });

  it("157 pre-check runs before ADD COLUMN in source script", () => {
    const script = readMigration("157_operation_charge_assignment_employee_id.sql");
    const throwIndex = script.indexOf(
      "Backfill required: operation_charge_assignments rows without resolvable employee link exist",
    );
    const addColumnIndex = script.indexOf("ADD employee_id UNIQUEIDENTIFIER NULL");
    assert.ok(throwIndex >= 0);
    assert.ok(addColumnIndex > throwIndex);
  });

  it("157 failure on upgrade path removes nullable employee_id column in the same batch", () => {
    const script = readMigration("157_operation_charge_assignment_employee_id.sql");
    assert.ok(script.includes("DROP COLUMN employee_id"));
    assert.ok(
      script.indexOf("DROP COLUMN employee_id") <
        script.indexOf("Backfill failed: operation_charge_assignments rows still without employee_id"),
    );
  });

  it("157 rollback is a no-op when employee_id was created by migration 155", async () => {
    const marker157 = await extendedPropertyExists(
      "operation_charge_assignments",
      "migration_157_added_employee_id_column",
    );
    assert.equal(marker157, false, "fresh 155 install should not set migration_157 marker");

    await applySqlScriptInTransaction(
      getPool(),
      readRollback("157_operation_charge_assignment_employee_id_rollback.sql"),
    );

    assert.equal(
      await tableColumnExists("dbo.operation_charge_assignments", "employee_id"),
      true,
    );
  });

  it("155 forward migration is idempotent on an already-migrated database", async () => {
    await applySqlScriptInTransaction(
      getPool(),
      readMigration("155_operation_charge_assignments_and_user_employee_links.sql"),
    );
    assert.equal(await tableColumnExists("dbo.operation_charge_assignments", "employee_id"), true);
    assert.equal(await tableColumnExists("dbo.company_user_employee_links", "employee_id"), true);
  });

  it("158 rollback script blocks when OPERATIONAL_MANAGER rows exist", () => {
    const script = readRollback("158_operational_manager_company_role_rollback.sql");
    assert.ok(script.includes("OPERATIONAL_MANAGER"));
    assert.ok(script.includes("THROW 50001"));
  });
});
