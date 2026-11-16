import type { ConnectionPool } from "mssql";

export const MIGRATION_164_NAME = "164_billing_plan_public_offering.sql";

export const IX_BILLING_PLANS_PUBLIC_ACTIVE_SORT = "IX_billing_plans_public_active_sort";

export type BillingPlanPublicOfferingColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

export const assertBillingPlanPublicOfferingColumn = (
  row: BillingPlanPublicOfferingColumnRow | undefined,
): void => {
  if (!row) {
    throw new Error("billing_plans.is_public_for_new_subscription column is missing.");
  }
  if (row.data_type !== "bit") {
    throw new Error(
      `billing_plans.is_public_for_new_subscription must be bit (got ${row.data_type}).`,
    );
  }
  if (row.is_nullable !== "NO") {
    throw new Error("billing_plans.is_public_for_new_subscription must be NOT NULL.");
  }
  if (!row.column_default?.includes("0") && !row.column_default?.includes("DF_billing_plans_public_for_new")) {
    throw new Error(
      "billing_plans.is_public_for_new_subscription must default to 0 via DF_billing_plans_public_for_new.",
    );
  }
};

export const assertBillingPlanPublicOfferingIndex = (input: {
  exists: boolean;
  is_disabled: boolean;
  type_desc: string;
}): void => {
  if (!input.exists) {
    throw new Error(`${IX_BILLING_PLANS_PUBLIC_ACTIVE_SORT} index is missing.`);
  }
  if (input.is_disabled) {
    throw new Error(`${IX_BILLING_PLANS_PUBLIC_ACTIVE_SORT} index is disabled.`);
  }
  if (input.type_desc !== "NONCLUSTERED") {
    throw new Error(
      `${IX_BILLING_PLANS_PUBLIC_ACTIVE_SORT} must be NONCLUSTERED (got ${input.type_desc}).`,
    );
  }
};

/** Validates migration 164 schema invariants; throws on drift. Does not auto-repair. */
export const assertBillingPlanPublicOfferingSchemaIntegrity = async (
  pool: ConnectionPool,
): Promise<void> => {
  const column = await pool.request().query(`
    SELECT
      c.COLUMN_NAME AS column_name,
      c.DATA_TYPE AS data_type,
      c.IS_NULLABLE AS is_nullable,
      dc.definition AS column_default
    FROM INFORMATION_SCHEMA.COLUMNS c
    LEFT JOIN sys.columns sc
      ON sc.object_id = OBJECT_ID(N'dbo.billing_plans')
      AND sc.name = c.COLUMN_NAME
    LEFT JOIN sys.default_constraints dc
      ON dc.parent_object_id = sc.object_id AND dc.parent_column_id = sc.column_id
    WHERE c.TABLE_SCHEMA = N'dbo'
      AND c.TABLE_NAME = N'billing_plans'
      AND c.COLUMN_NAME = N'is_public_for_new_subscription'
  `);

  assertBillingPlanPublicOfferingColumn(
    column.recordset[0] as BillingPlanPublicOfferingColumnRow | undefined,
  );

  const index = await pool.request().query(`
    SELECT
      i.name,
      i.is_disabled,
      i.type_desc
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.billing_plans')
      AND i.name = N'${IX_BILLING_PLANS_PUBLIC_ACTIVE_SORT}'
  `);

  const indexRow = index.recordset[0] as
    | { name: string; is_disabled: boolean; type_desc: string }
    | undefined;

  assertBillingPlanPublicOfferingIndex({
    exists: Boolean(indexRow),
    is_disabled: Boolean(indexRow?.is_disabled),
    type_desc: String(indexRow?.type_desc ?? ""),
  });
};