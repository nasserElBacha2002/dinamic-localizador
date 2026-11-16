import type { ConnectionPool } from "mssql";

const normalizeFilter = (value: string | null | undefined): string =>
  String(value ?? "")
    .replace(/=/g, " ")
    .replace(/[[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Canonical filter for open permanent exemptions (migration 163). */
export const UX_BCE_COMPANY_PERMANENT_OPEN_FILTER_CANONICAL =
  "is_permanent 1 and expires_at is null";

export type BillingCompanyExemptionUniqueIndexRow = {
  is_disabled: boolean;
  is_unique: boolean;
  type_desc: string;
  filter_definition: string | null;
};

/** Validates UX_bce_company_permanent_open invariants (unit-testable without SQL). */
export const assertUxBceCompanyPermanentOpenIndex = (
  indexRow: BillingCompanyExemptionUniqueIndexRow,
  keyColumnNames: string[],
): void => {
  if (indexRow.is_disabled) {
    throw new Error("UX_bce_company_permanent_open index is disabled.");
  }
  if (!indexRow.is_unique) {
    throw new Error("UX_bce_company_permanent_open index is not unique.");
  }
  const normalizedFilter = normalizeFilter(indexRow.filter_definition);
  if (normalizedFilter !== UX_BCE_COMPANY_PERMANENT_OPEN_FILTER_CANONICAL) {
    throw new Error(
      `UX_bce_company_permanent_open filter must be permanent open rows (expected "${UX_BCE_COMPANY_PERMANENT_OPEN_FILTER_CANONICAL}", got "${normalizedFilter}").`,
    );
  }
  if (keyColumnNames.length !== 1 || keyColumnNames[0] !== "company_id") {
    throw new Error("UX_bce_company_permanent_open must be a unique key on company_id only.");
  }
};

/** Explicit DDL repair for disposable environments (not part of read-only schema validation). */
export const repairBillingCompanyExemptionsImmutabilityTrigger = async (
  pool: ConnectionPool,
): Promise<void> => {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.TR_billing_company_exemptions_immutable', N'TR') IS NOT NULL
    BEGIN
      ENABLE TRIGGER TR_billing_company_exemptions_immutable ON dbo.billing_company_exemptions;
    END;
  `);
};

export const assertBillingCompanyExemptionsImmutabilityTriggerEnabled = async (
  pool: ConnectionPool,
): Promise<void> => {
  const trigger = await pool.request().query(`
    SELECT t.name, t.is_disabled
    FROM sys.triggers t
    WHERE t.parent_id = OBJECT_ID(N'dbo.billing_company_exemptions')
      AND t.name = N'TR_billing_company_exemptions_immutable'
  `);
  const triggerRow = trigger.recordset[0] as { name: string; is_disabled: boolean } | undefined;
  if (!triggerRow) {
    throw new Error("TR_billing_company_exemptions_immutable is missing.");
  }
  if (triggerRow.is_disabled) {
    throw new Error("TR_billing_company_exemptions_immutable is disabled.");
  }
};

/** Validates migration 163 schema invariants; throws on partial or drifted DDL. */
export const assertBillingCompanyExemptionsSchemaIntegrity = async (
  pool: ConnectionPool,
): Promise<void> => {
  const table = await pool.request().query(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'billing_company_exemptions'
  `);
  if (!table.recordset[0]) {
    throw new Error("billing_company_exemptions table is missing.");
  }

  const requiredColumns = [
    "id",
    "company_id",
    "exemption_reason",
    "is_permanent",
    "expires_at",
    "created_source",
    "created_by_user_id",
    "created_at",
    "updated_at",
  ];
  const columns = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'billing_company_exemptions'
  `);
  const present = new Set(columns.recordset.map((row) => String(row.COLUMN_NAME)));
  for (const name of requiredColumns) {
    if (!present.has(name)) {
      throw new Error(`billing_company_exemptions column missing: ${name}`);
    }
  }

  const uniqueIndex = await pool.request().query(`
    SELECT i.name, i.is_disabled, i.is_unique, i.type_desc, i.filter_definition
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.billing_company_exemptions')
      AND i.name = N'UX_bce_company_permanent_open'
  `);
  if (uniqueIndex.recordset.length !== 1) {
    throw new Error("UX_bce_company_permanent_open index is missing.");
  }

  const indexRow = uniqueIndex.recordset[0] as BillingCompanyExemptionUniqueIndexRow;

  const indexColumns = await pool.request().query(`
    SELECT c.name AS column_name
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic
      ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    INNER JOIN sys.columns c
      ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.billing_company_exemptions')
      AND i.name = N'UX_bce_company_permanent_open'
      AND ic.is_included_column = 0
    ORDER BY ic.key_ordinal ASC
  `);
  const indexKeyNames = indexColumns.recordset.map((row) => String(row.column_name));
  assertUxBceCompanyPermanentOpenIndex(indexRow, indexKeyNames);

  const fkCompany = await pool.request().query(`
    SELECT 1 AS found
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.billing_company_exemptions')
      AND name = N'FK_billing_company_exemptions_company'
  `);
  if (!fkCompany.recordset[0]) {
    throw new Error("FK_billing_company_exemptions_company is missing.");
  }

  await assertBillingCompanyExemptionsImmutabilityTriggerEnabled(pool);

  const triggerDefinition = await pool.request().query(`
    SELECT m.definition
    FROM sys.triggers t
    INNER JOIN sys.sql_modules m ON m.object_id = t.object_id
    WHERE t.parent_id = OBJECT_ID(N'dbo.billing_company_exemptions')
      AND t.name = N'TR_billing_company_exemptions_immutable'
  `);
  const definition = String(
    (triggerDefinition.recordset[0] as { definition: string } | undefined)?.definition ?? "",
  );
  if (!definition.includes("50163") || !definition.includes("is_permanent")) {
    throw new Error("TR_billing_company_exemptions_immutable definition is incomplete.");
  }
};