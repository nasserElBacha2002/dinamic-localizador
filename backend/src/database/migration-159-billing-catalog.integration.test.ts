/**
 * Migration 159 — billing commercial catalog schema.
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
import { ensureBillingCatalogMigration } from "../test-helpers/ensure-billing-catalog-migration";
import { getPool } from "./connection";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("tableName", sql.NVarChar(256), tableName)
    .query(`
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
    `);
  return Boolean(result.recordset[0]);
};

describeDatabaseIntegration("migration 159 billing commercial catalog", () => {
  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingCatalogMigration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("defines billing catalog tables with expected constraints", async () => {
    assert.equal(await tableExists("billing_plans"), true);
    assert.equal(await tableExists("billing_plan_tiers"), true);
    assert.equal(await tableExists("billing_plan_prices"), true);

    const indexes = await getPool().request().query(`
      SELECT name
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.billing_plan_prices')
        AND name = N'UX_bpp_open_applicability'
    `);
    assert.equal(indexes.recordset.length, 1);

  const indexColumns = await getPool().request().query(`
      SELECT c.name AS column_name
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c
        ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID(N'dbo.billing_plan_prices')
        AND i.name = N'UX_bpp_open_applicability'
      ORDER BY ic.key_ordinal ASC
    `);
    const columnNames = indexColumns.recordset.map((row) => String(row.column_name));
    assert.deepEqual(columnNames, [
      "billing_plan_tier_id",
      "currency",
      "billing_period",
      "price_kind",
    ]);
  });

  it("migration script is present for review", () => {
    const script = readFileSync(join(migrationsDir, "159_billing_commercial_catalog.sql"), "utf8");
    assert.match(script, /billing_plans/);
    assert.match(script, /billing_plan_tiers/);
    assert.match(script, /billing_plan_prices/);
    assert.doesNotMatch(script, /INSERT INTO dbo\.billing_plan/i);
  });

  it("rollback script guards partial schema and uses exclusive locks", () => {
    const rollback = readFileSync(
      join(migrationsDir, "rollback", "159_billing_commercial_catalog_rollback.sql"),
      "utf8",
    );
    assert.match(rollback, /TABLOCKX/);
    assert.match(rollback, /BEGIN TRANSACTION/i);
    assert.match(rollback, /partial billing catalog schema/i);
    assert.match(rollback, /DISPOSABLE DATABASES ONLY/i);
  });
});
