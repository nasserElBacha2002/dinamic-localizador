/**
 * Migration 160 — billing subscriptions schema.
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
import { ensureBillingSubscriptionsMigration } from "../test-helpers/ensure-billing-subscriptions-migration";
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

describeDatabaseIntegration("migration 160 billing subscriptions", () => {
  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingSubscriptionsMigration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("defines subscription contract guard triggers when 161/162 are applied", async () => {
    const triggers = await getPool().request().query(`
      SELECT name, OBJECT_NAME(parent_id) AS parent_table
      FROM sys.triggers
      WHERE name IN (
        N'TR_billing_subscriptions_open_overlap',
        N'TR_billing_subscription_terms_within_subscription'
      )
    `);
    assert.equal(triggers.recordset.length, 2);
    const parentTables = triggers.recordset.map((row) => String(row.parent_table)).sort();
    assert.deepEqual(parentTables, ["billing_subscription_terms", "billing_subscriptions"]);
  });

  it("defines cancelled_at on subscription terms when 162 is applied", async () => {
    const column = await getPool().request().query(`
      SELECT 1 AS found
      WHERE COL_LENGTH(N'dbo.billing_subscription_terms', N'cancelled_at') IS NOT NULL
    `);
    assert.equal(Boolean(column.recordset[0]), true);
  });

  it("defines subscription tables with expected partial unique indexes", async () => {
    assert.equal(await tableExists("billing_subscriptions"), true);
    assert.equal(await tableExists("billing_subscription_terms"), true);

    const indexes = await getPool().request().query(`
      SELECT name
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.billing_subscriptions')
        AND name IN (
          N'UX_billing_subscriptions_company_active',
          N'UX_billing_subscriptions_company_scheduled'
        )
    `);
    assert.equal(indexes.recordset.length, 2);

    const openTerm = await getPool().request().query(`
      SELECT name
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
        AND name = N'UX_bst_subscription_open_term'
    `);
    assert.equal(openTerm.recordset.length, 1);
  });

  it("migration script is present and does not seed subscriptions", () => {
    const script = readFileSync(join(migrationsDir, "160_billing_subscriptions.sql"), "utf8");
    assert.match(script, /billing_subscriptions/);
    assert.match(script, /billing_subscription_terms/);
    assert.doesNotMatch(script, /INSERT INTO dbo\.billing_subscriptions/i);
  });

  it("rollback 162 validates under lock in a single transactional DDL batch", () => {
    const rollback = readFileSync(
      join(migrationsDir, "rollback", "162_billing_subscription_term_cancellation_rollback.sql"),
      "utf8",
    );
    const tablock = rollback.indexOf("TABLOCKX");
    const dataGuard = rollback.indexOf("cancelled_at data");
    const dropIndex = rollback.indexOf("DROP INDEX");
    assert.ok(dataGuard >= 0);
    assert.ok(tablock >= 0);
    assert.ok(tablock < dataGuard);
    assert.ok(dropIndex > dataGuard);
    assert.match(rollback, /sp_executesql/i);
    assert.match(rollback, /DISPOSABLE DATABASES ONLY/i);
    assert.equal((rollback.match(/COMMIT TRANSACTION/g) ?? []).length, 1);
  });

  it("rollback script guards partial schema and uses exclusive locks", () => {
    const rollback = readFileSync(
      join(migrationsDir, "rollback", "160_billing_subscriptions_rollback.sql"),
      "utf8",
    );
    assert.match(rollback, /TABLOCKX/);
    assert.match(rollback, /BEGIN TRANSACTION/i);
    assert.match(rollback, /partial billing subscription schema/i);
    assert.match(rollback, /DISPOSABLE DATABASES ONLY/i);
  });
});
