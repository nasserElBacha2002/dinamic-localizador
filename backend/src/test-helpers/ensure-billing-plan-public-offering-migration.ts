import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionPool } from "mssql";
import { getPool } from "../database/connection";
import { applySqlScriptInTransaction, getAppliedMigrations } from "../database/run-migrations";
import {
  assertBillingPlanPublicOfferingSchemaIntegrity,
  MIGRATION_164_NAME,
} from "../utils/billing/billing-plan-public-offering-schema";
import {
  assertSafeIntegrationDatabaseConnectedTarget,
  assertSafeIntegrationDatabaseTarget,
} from "./integration-test";
import { ensureBillingCatalogMigration } from "./ensure-billing-catalog-migration";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const MIGRATION_FILE = MIGRATION_164_NAME;

let ensureMigrationPromise: Promise<void> | null = null;

const migrationRegistered = async (): Promise<boolean> => {
  const applied = await getAppliedMigrations(getPool());
  return applied.has(MIGRATION_FILE);
};

const schemaIntegrityOk = async (pool: ConnectionPool): Promise<boolean> => {
  try {
    await assertBillingPlanPublicOfferingSchemaIntegrity(pool);
    return true;
  } catch {
    return false;
  }
};

/** Applies migration 164 when not registered in system_migrations (disposable DB / CI only). */
export const ensureBillingPlanPublicOfferingMigration = async (): Promise<void> => {
  assertSafeIntegrationDatabaseTarget();

  if (!ensureMigrationPromise) {
    ensureMigrationPromise = (async () => {
      const pool = getPool();
      await assertSafeIntegrationDatabaseConnectedTarget(pool);
      await ensureBillingCatalogMigration();

      const registered = await migrationRegistered();
      const schemaOk = await schemaIntegrityOk(pool);

      if (registered && !schemaOk) {
        throw new Error(
          `Integration DB inconsistent: ${MIGRATION_FILE} registered but billing_plans public-offering schema failed integrity checks.`,
        );
      }
      if (!registered && schemaOk) {
        throw new Error(
          `Integration DB inconsistent: billing_plans public-offering schema present without ${MIGRATION_FILE} in system_migrations.`,
        );
      }

      if (!registered) {
        const script = readFileSync(join(migrationsDir, MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(pool, script, {
          registerMigrationName: MIGRATION_FILE,
        });
      }

      await assertBillingPlanPublicOfferingSchemaIntegrity(pool);
      if (!(await migrationRegistered())) {
        throw new Error(
          `Integration DB inconsistent: ${MIGRATION_FILE} expected in system_migrations after apply.`,
        );
      }
    })();
  }

  await ensureMigrationPromise;
  await assertBillingPlanPublicOfferingSchemaIntegrity(getPool());
};

export { assertBillingPlanPublicOfferingSchemaIntegrity };