import { readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { getPool } from "../database/connection";
import { applySqlScriptInTransaction } from "../database/run-migrations";
import {
  assertSafeIntegrationDatabaseConnectedTarget,
  assertSafeIntegrationDatabaseTarget,
} from "./integration-test";

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

/** Repairs UX_bpp_open_applicability when a dev DB applied an older 159 without price_kind. */
const repairOpenApplicabilityIndex = async (): Promise<void> => {
  await getPool().request().query(`
    IF OBJECT_ID(N'dbo.billing_plan_prices', N'U') IS NOT NULL
    BEGIN
      DECLARE @indexId INT = (
        SELECT index_id
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.billing_plan_prices')
          AND name = N'UX_bpp_open_applicability'
      );

      IF @indexId IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
            ON ic.object_id = c.object_id AND ic.column_id = c.column_id
          WHERE ic.object_id = OBJECT_ID(N'dbo.billing_plan_prices')
            AND ic.index_id = @indexId
            AND c.name = N'price_kind'
        )
      BEGIN
        IF @indexId IS NOT NULL
        BEGIN
          DROP INDEX UX_bpp_open_applicability ON dbo.billing_plan_prices;
        END;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE object_id = OBJECT_ID(N'dbo.billing_plan_prices')
            AND name = N'UX_bpp_open_applicability'
        )
        BEGIN
          CREATE UNIQUE INDEX UX_bpp_open_applicability
            ON dbo.billing_plan_prices (
              billing_plan_tier_id,
              currency,
              billing_period,
              price_kind
            )
            WHERE effective_to IS NULL;
        END;
      END;
    END;
  `);
};

/** Applies migration 159 when integration DB has not migrated yet (local dev / CI only). */
export const ensureBillingCatalogMigration = async (): Promise<void> => {
  assertSafeIntegrationDatabaseTarget();

  if (!ensureMigrationPromise) {
    ensureMigrationPromise = (async () => {
      const pool = getPool();
      await assertSafeIntegrationDatabaseConnectedTarget(pool);

      if (!(await billingPlansTableExists())) {
        const script = readFileSync(join(migrationsDir, MIGRATION_FILE), "utf8");
        await applySqlScriptInTransaction(getPool(), script, {
          registerMigrationName: MIGRATION_FILE,
        });
      }

      await repairOpenApplicabilityIndex();
    })();
  }

  await ensureMigrationPromise;
};
