import { readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { getPool } from "../database/connection";
import { applySqlScriptInTransaction, getAppliedMigrations } from "../database/run-migrations";
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

const termsTriggerEnforcesBoundedOpenEnd = async (): Promise<boolean> => {
  const result = await getPool().request().query(`
    SELECT 1 AS found
    FROM sys.sql_modules m
    INNER JOIN sys.triggers t ON m.object_id = t.object_id
    WHERE t.name = N'TR_billing_subscription_terms_within_subscription'
      AND m.definition LIKE N'%cancelled_at IS NULL%'
      AND m.definition LIKE N'%i.effective_to IS NULL%'
  `);
  return Boolean(result.recordset[0]);
};

const assertMigrationSchemaConsistency = async (
  applied: Set<string>,
  migrationName: string,
  schemaOk: () => Promise<boolean>,
  detail: string,
): Promise<void> => {
  const registered = applied.has(migrationName);
  const ok = await schemaOk();
  if (registered && !ok) {
    throw new Error(
      `Integration DB inconsistent: ${migrationName} registered in system_migrations but ${detail} missing.`,
    );
  }
  if (!registered && ok) {
    throw new Error(
      `Integration DB inconsistent: ${detail} present without ${migrationName} in system_migrations. Run platform migrate or repair manually.`,
    );
  }
};

let ensureMigrationPromise: Promise<void> | null = null;

/** Applies migrations 160–162 when not registered in system_migrations (disposable DB / CI only). */
export const ensureBillingSubscriptionsMigration = async (): Promise<void> => {
  assertSafeIntegrationDatabaseTarget();

  if (!ensureMigrationPromise) {
    ensureMigrationPromise = (async () => {
      await ensureBillingCatalogMigration();
      const pool = getPool();
      await assertSafeIntegrationDatabaseConnectedTarget(pool);

      const applied = await getAppliedMigrations(pool);

      await assertMigrationSchemaConsistency(
        applied,
        MIGRATION_FILE,
        subscriptionsTableExists,
        "billing_subscriptions tables",
      );

      if (!applied.has(MIGRATION_FILE)) {
        const script = readFileSync(join(migrationsDir, MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(pool, script, {
          registerMigrationName: MIGRATION_FILE,
        });
        applied.add(MIGRATION_FILE);
      }

      await assertMigrationSchemaConsistency(
        applied,
        GUARDS_MIGRATION_FILE,
        contractGuardTriggersApplied,
        "billing subscription contract guard triggers",
      );

      if (!applied.has(GUARDS_MIGRATION_FILE)) {
        const guards = readFileSync(join(migrationsDir, GUARDS_MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(pool, guards, {
          registerMigrationName: GUARDS_MIGRATION_FILE,
        });
        applied.add(GUARDS_MIGRATION_FILE);
      }

      await assertMigrationSchemaConsistency(
        applied,
        CANCELLATION_MIGRATION_FILE,
        async () => (await termCancelledAtColumnExists()) && (await termsTriggerEnforcesBoundedOpenEnd()),
        "billing_subscription_terms cancelled_at and bounded-term trigger",
      );

      if (!applied.has(CANCELLATION_MIGRATION_FILE)) {
        const cancellation = readFileSync(join(migrationsDir, CANCELLATION_MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(pool, cancellation, {
          registerMigrationName: CANCELLATION_MIGRATION_FILE,
        });
      }
    })();
  }

  await ensureMigrationPromise;
};
