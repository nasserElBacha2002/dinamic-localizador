import sql from "mssql";
import type { BillingExemptionCreatedSource } from "../../constants/billing-company-exemption";
import { getPool } from "../../database/connection";
import type { BillingCompanyExemption } from "../../types/billing-company-exemption";
import { normalizeCompanyId } from "../../utils/billing/protected-company-exemption";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): BillingCompanyExemption => ({
  id: String(row.id),
  companyId: String(row.company_id),
  exemptionReason: String(row.exemption_reason),
  isPermanent: Boolean(row.is_permanent),
  expiresAt: row.expires_at == null ? null : toIso(row.expires_at as Date | string),
  createdSource: String(row.created_source),
  createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

const findOpenPermanentByCompanyIdQuery = async (
  executor: sql.ConnectionPool | sql.Transaction,
  companyId: string,
  lockClause: string,
): Promise<BillingCompanyExemption | null> => {
  const request =
    executor instanceof sql.Transaction ? new sql.Request(executor) : executor.request();
  const result = await request.input("companyId", sql.UniqueIdentifier, companyId).query(`
    SELECT TOP 1 *
    FROM dbo.billing_company_exemptions ${lockClause}
    WHERE company_id = @companyId
      AND is_permanent = 1
      AND expires_at IS NULL
  `);
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
};

const recoverDuplicateRaceOnPool = async (
  companyId: string,
  error: unknown,
): Promise<{ inserted: false; exemption: BillingCompanyExemption }> => {
  if (!isDuplicateKeyError(error)) {
    throw error;
  }

  const pool = getPool();
  const raced = await findOpenPermanentByCompanyIdQuery(pool, companyId, "");
  if (!raced) {
    throw error;
  }
  if (normalizeCompanyId(raced.companyId) !== normalizeCompanyId(companyId)) {
    throw new Error(
      `Duplicate key on billing_company_exemptions for ${companyId} but recovered row belongs to ${raced.companyId}.`,
    );
  }
  return { inserted: false, exemption: raced };
};

const insertPermanentQuery = `
  INSERT INTO dbo.billing_company_exemptions (
    company_id,
    exemption_reason,
    is_permanent,
    expires_at,
    created_source,
    created_by_user_id
  )
  OUTPUT INSERTED.*
  VALUES (
    @companyId,
    @exemptionReason,
    1,
    NULL,
    @createdSource,
    @createdByUserId
  )
`;

export const billingCompanyExemptionRepository = {
  async findOpenPermanentByCompanyId(companyId: string): Promise<BillingCompanyExemption | null> {
    return findOpenPermanentByCompanyIdQuery(getPool(), companyId, "");
  },

  async findOpenPermanentByCompanyIdInTransaction(
    transaction: sql.Transaction,
    companyId: string,
  ): Promise<BillingCompanyExemption | null> {
    return findOpenPermanentByCompanyIdQuery(transaction, companyId, "WITH (UPDLOCK, HOLDLOCK)");
  },

  async insertPermanentIfAbsentInTransaction(
    transaction: sql.Transaction,
    input: {
      companyId: string;
      exemptionReason: string;
      createdSource: BillingExemptionCreatedSource;
      createdByUserId?: string | null;
    },
  ): Promise<{ inserted: boolean; exemption: BillingCompanyExemption }> {
    const existing = await this.findOpenPermanentByCompanyIdInTransaction(
      transaction,
      input.companyId,
    );
    if (existing) {
      return { inserted: false, exemption: existing };
    }

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("exemptionReason", sql.NVarChar(500), input.exemptionReason)
      .input("createdSource", sql.NVarChar(40), input.createdSource)
      .input("createdByUserId", sql.UniqueIdentifier, input.createdByUserId ?? null)
      .query(insertPermanentQuery);
    const row = result.recordset[0] as Record<string, unknown>;
    return { inserted: true, exemption: mapRow(row) };
  },

  async insertPermanentIfAbsent(input: {
    companyId: string;
    exemptionReason: string;
    createdSource: BillingExemptionCreatedSource;
    createdByUserId?: string | null;
  }): Promise<{ inserted: boolean; exemption: BillingCompanyExemption | null }> {
    const pool = getPool();
    const existing = await this.findOpenPermanentByCompanyId(input.companyId);
    if (existing) {
      return { inserted: false, exemption: existing };
    }

    try {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("exemptionReason", sql.NVarChar(500), input.exemptionReason)
        .input("createdSource", sql.NVarChar(40), input.createdSource)
        .input("createdByUserId", sql.UniqueIdentifier, input.createdByUserId ?? null)
        .query(insertPermanentQuery);
      const row = result.recordset[0] as Record<string, unknown>;
      return { inserted: true, exemption: mapRow(row) };
    } catch (error) {
      const duplicate = await recoverDuplicateRaceOnPool(input.companyId, error);
      return { inserted: duplicate.inserted, exemption: duplicate.exemption };
    }
  },
};