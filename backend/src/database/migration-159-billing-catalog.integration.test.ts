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
  });

  it("migration script is present for review", () => {
    const script = readFileSync(join(migrationsDir, "159_billing_commercial_catalog.sql"), "utf8");
    assert.match(script, /billing_plans/);
    assert.match(script, /billing_plan_tiers/);
    assert.match(script, /billing_plan_prices/);
    assert.doesNotMatch(script, /INSERT INTO dbo\.billing_plan/i);
  });
});
