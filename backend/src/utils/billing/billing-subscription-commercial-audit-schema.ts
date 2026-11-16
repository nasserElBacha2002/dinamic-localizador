import type sql from "mssql";

const MIGRATION_FILE = "165_billing_subscription_term_commercial_audit.sql";

const TERM_COLUMNS = [
  "commercial_reference",
  "created_by_user_id",
  "admin_request_key",
] as const;

const SUBSCRIPTION_COLUMNS = ["admin_request_key"] as const;

const TERM_INDEX = "UX_bst_subscription_admin_request";
const SUBSCRIPTION_INDEX = "UX_billing_subscriptions_company_admin_request";

export const assertBillingSubscriptionCommercialAuditSchemaIntegrity = async (
  pool: sql.ConnectionPool,
  appliedMigrations: Set<string>,
): Promise<void> => {
  if (appliedMigrations.has(MIGRATION_FILE)) {
    for (const column of TERM_COLUMNS) {
      const found = await pool.request().query(`
        SELECT 1 AS found
        WHERE COL_LENGTH(N'dbo.billing_subscription_terms', N'${column}') IS NOT NULL
      `);
      if (!found.recordset[0]) {
        throw new Error(
          `Integration DB inconsistent: ${MIGRATION_FILE} registered but billing_subscription_terms.${column} missing.`,
        );
      }
    }
    for (const column of SUBSCRIPTION_COLUMNS) {
      const found = await pool.request().query(`
        SELECT 1 AS found
        WHERE COL_LENGTH(N'dbo.billing_subscriptions', N'${column}') IS NOT NULL
      `);
      if (!found.recordset[0]) {
        throw new Error(
          `Integration DB inconsistent: ${MIGRATION_FILE} registered but billing_subscriptions.${column} missing.`,
        );
      }
    }

    const termIndex = await pool.request().query(`
      SELECT 1 AS found
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.billing_subscription_terms')
        AND name = N'${TERM_INDEX}'
    `);
    const subIndex = await pool.request().query(`
      SELECT 1 AS found
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.billing_subscriptions')
        AND name = N'${SUBSCRIPTION_INDEX}'
    `);
    if (!termIndex.recordset[0] || !subIndex.recordset[0]) {
      throw new Error(
        `Integration DB inconsistent: ${MIGRATION_FILE} registered but idempotency indexes missing.`,
      );
    }
    return;
  }

  const anyPresent = await pool.request().query(`
    SELECT 1 AS found
    WHERE COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_reference') IS NOT NULL
       OR COL_LENGTH(N'dbo.billing_subscriptions', N'admin_request_key') IS NOT NULL
  `);
  if (anyPresent.recordset[0]) {
    throw new Error(
      `Integration DB inconsistent: migration 165 schema present without ${MIGRATION_FILE} in system_migrations.`,
    );
  }
};