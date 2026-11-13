import { readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { getPool } from "../database/connection";
import { applySqlScriptInTransaction } from "../database/run-migrations";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const MIGRATION_FILE = "159_billing_commercial_catalog.sql";

const billingPlansTableExists = async (): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("tableName", sql.NVarChar(256), "billing_plans")
    .query(`
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
    `);
  return Boolean(result.recordset[0]);
};

let ensureMigrationPromise: Promise<void> | null = null;

/** Applies migration 159 when integration DB has not migrated yet (local dev). */
export const ensureBillingCatalogMigration = async (): Promise<void> => {
  if (!ensureMigrationPromise) {
    ensureMigrationPromise = (async () => {
      if (await billingPlansTableExists()) {
        return;
      }

      const script = readFileSync(join(migrationsDir, MIGRATION_FILE), "utf8");
      await applySqlScriptInTransaction(getPool(), script, {
        registerMigrationName: MIGRATION_FILE,
      });
    })();
  }

  await ensureMigrationPromise;
};
