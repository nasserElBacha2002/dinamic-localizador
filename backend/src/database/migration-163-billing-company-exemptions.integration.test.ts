/**
 * Migration 163 — shared integration DB (read-only / static checks only).
 * Destructive proofs run on ephemeral databases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { assertBillingCompanyExemptionsSchemaIntegrity } from "../utils/billing/billing-company-exemption-schema";
import { ensureBillingCompanyExemptionsMigration } from "../test-helpers/ensure-billing-company-exemptions-migration";
import { getPool } from "./connection";
import sql from "mssql";

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

describeDatabaseIntegration("migration 163 billing company exemptions", () => {
  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingCompanyExemptionsMigration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("defines exemptions table, unique permanent index, and immutability trigger", async () => {
    assert.equal(await tableExists("billing_company_exemptions"), true);
    await assertBillingCompanyExemptionsSchemaIntegrity(getPool());
  });

  it("migration script is present and does not seed exemptions", () => {
    const script = readFileSync(join(migrationsDir, "163_billing_company_exemptions.sql"), "utf8");
    assert.match(script, /billing_company_exemptions/);
    assert.doesNotMatch(script, /INSERT INTO dbo\.billing_company_exemptions/i);
  });

  it("rollback script blocks when exemption data exists and uses exclusive locks", () => {
    const rollback = readFileSync(
      join(migrationsDir, "rollback", "163_billing_company_exemptions_rollback.sql"),
      "utf8",
    );
    assert.match(rollback, /TABLOCKX/);
    assert.match(rollback, /BEGIN TRANSACTION/i);
    assert.match(rollback, /contain data/i);
    assert.match(rollback, /DISPOSABLE DATABASES ONLY/i);
  });
});