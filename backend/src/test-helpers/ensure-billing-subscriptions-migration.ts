import { readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { getPool } from "../database/connection";
import { applySqlScriptInTransaction } from "../database/run-migrations";
import {
  assertSafeIntegrationDatabaseConnectedTarget,
  assertSafeIntegrationDatabaseTarget,
} from "./integration-test";
import { ensureBillingCatalogMigration } from "./ensure-billing-catalog-migration";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const MIGRATION_FILE = "160_billing_subscriptions.sql";
const GUARDS_MIGRATION_FILE = "161_billing_subscriptions_contract_guards.sql";
const CANCELLATION_MIGRATION_FILE = "162_billing_subscription_term_cancellation.sql";

const subscriptionsTableExists = async (): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("tableName", sql.NVarChar(256), "billing_subscriptions")
    .query(`
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
    `);
  return Boolean(result.recordset[0]);
};

const contractGuardTriggersApplied = async (): Promise<boolean> => {
  const result = await getPool().request().query(`
    SELECT name
    FROM sys.triggers
    WHERE (parent_id = OBJECT_ID(N'dbo.billing_subscriptions') AND name = N'TR_billing_subscriptions_open_overlap')
       OR (parent_id = OBJECT_ID(N'dbo.billing_subscription_terms') AND name = N'TR_billing_subscription_terms_within_subscription')
  `);
  return result.recordset.length === 2;
};

const termCancelledAtColumnExists = async (): Promise<boolean> => {
  const result = await getPool().request().query(`
    SELECT 1 AS found
    WHERE COL_LENGTH(N'dbo.billing_subscription_terms', N'cancelled_at') IS NOT NULL
  `);
  return Boolean(result.recordset[0]);
};

let ensureMigrationPromise: Promise<void> | null = null;

/** Applies migrations 160–162 when integration DB has not migrated yet (local dev / CI only). */
export const ensureBillingSubscriptionsMigration = async (): Promise<void> => {
  assertSafeIntegrationDatabaseTarget();

  if (!ensureMigrationPromise) {
    ensureMigrationPromise = (async () => {
      await ensureBillingCatalogMigration();
      const pool = getPool();
      await assertSafeIntegrationDatabaseConnectedTarget(pool);

      if (!(await subscriptionsTableExists())) {
        const script = readFileSync(join(migrationsDir, MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(getPool(), script, {
          registerMigrationName: MIGRATION_FILE,
        });
      }

      if (!(await contractGuardTriggersApplied())) {
        const guards = readFileSync(join(migrationsDir, GUARDS_MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(getPool(), guards, {
          registerMigrationName: GUARDS_MIGRATION_FILE,
        });
      }

      const needsTermCancellationMigration =
        !(await termCancelledAtColumnExists()) || !(await contractGuardTriggersApplied());
      if (needsTermCancellationMigration) {
        const cancellation = readFileSync(join(migrationsDir, CANCELLATION_MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(getPool(), cancellation, {
          registerMigrationName: CANCELLATION_MIGRATION_FILE,
        });
      }
    })();
  }

  await ensureMigrationPromise;
};
