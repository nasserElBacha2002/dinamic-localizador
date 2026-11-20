import sql from "mssql";
import {
  BILLING_EXEMPTION_CREATED_SOURCES,
  PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS,
  type ProtectedStrategicCompanyExemption,
} from "../../constants/billing-company-exemption";
import { getPool } from "../../database/connection";
import { billingCompanyExemptionRepository } from "../../repositories/billing/billing-company-exemption.repository";
import { companyNamesMatchForExemption } from "../../utils/billing/protected-company-exemption";

export class BillingCompanyExemptionSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingCompanyExemptionSeedError";
  }
}

export interface BillingCompanyExemptionSeedResult {
  companyId: string;
  expectedName: string;
  inserted: boolean;
  skippedExisting: boolean;
  companyFound: boolean;
}

export interface StrategicCompanyIdentityCheck {
  entry: ProtectedStrategicCompanyExemption;
  found: boolean;
  actualName: string | null;
}

export const loadStrategicCompanyIdentity = async (
  entry: ProtectedStrategicCompanyExemption,
): Promise<StrategicCompanyIdentityCheck> => {
  const pool = getPool();
  const result = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, entry.companyId)
    .query(`
      SELECT TOP 1 name
      FROM dbo.companies
      WHERE id = @companyId
    `);
  const actualName = result.recordset[0]?.name ? String(result.recordset[0].name) : null;
  return { entry, found: Boolean(actualName), actualName };
};

const loadStrategicCompanyIdentityInTransaction = async (
  transaction: sql.Transaction,
  entry: ProtectedStrategicCompanyExemption,
): Promise<StrategicCompanyIdentityCheck> => {
  const result = await new sql.Request(transaction)
    .input("companyId", sql.UniqueIdentifier, entry.companyId)
    .query(`
      SELECT TOP 1 name
      FROM dbo.companies WITH (UPDLOCK, HOLDLOCK)
      WHERE id = @companyId
    `);
  const actualName = result.recordset[0]?.name ? String(result.recordset[0].name) : null;
  return { entry, found: Boolean(actualName), actualName };
};

const protectedStrategicSeedOrder = (): ProtectedStrategicCompanyExemption[] =>
  [...PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS].sort((left, right) =>
    left.companyId.localeCompare(right.companyId),
  );

/** Validates every strategic identity before any write (UUID is the primary key). */
export const validateProtectedStrategicIdentities = (
  checks: StrategicCompanyIdentityCheck[],
): void => {
  const failures: string[] = [];
  for (const check of checks) {
    if (!check.found) {
      failures.push(
        `Protected company missing: ${check.entry.companyId} (${check.entry.expectedName}).`,
      );
      continue;
    }

    if (
      !check.actualName ||
      !companyNamesMatchForExemption(check.actualName, check.entry.expectedName)
    ) {
      failures.push(
        `Protected company identity mismatch for ${check.entry.companyId}: expected "${check.entry.expectedName}", found "${check.actualName ?? ""}".`,
      );
    }
  }

  if (failures.length > 0) {
    throw new BillingCompanyExemptionSeedError(failures.join(" "));
  }
};

/**
 * Idempotent disposable seed: validate all three identities, then insert all exemptions in one SQL transaction.
 * Any validation or write failure rolls back the entire seed (no partial exemptions).
 */
export const seedProtectedStrategicCompanyExemptions = async (input?: {
  createdByUserId?: string | null;
}): Promise<BillingCompanyExemptionSeedResult[]> => {
  const createdSource = BILLING_EXEMPTION_CREATED_SOURCES[0];
  const orderedEntries = protectedStrategicSeedOrder();
  const preflightChecks = await Promise.all(
    orderedEntries.map((entry) => loadStrategicCompanyIdentity(entry)),
  );
  validateProtectedStrategicIdentities(preflightChecks);

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  const results: BillingCompanyExemptionSeedResult[] = [];

  try {
    await new sql.Request(transaction).query(`SET XACT_ABORT ON;`);

    const identityChecks: StrategicCompanyIdentityCheck[] = [];
    for (const entry of orderedEntries) {
      identityChecks.push(await loadStrategicCompanyIdentityInTransaction(transaction, entry));
    }
    validateProtectedStrategicIdentities(identityChecks);

    for (const check of identityChecks) {
      const write = await billingCompanyExemptionRepository.insertPermanentIfAbsentInTransaction(
        transaction,
        {
          companyId: check.entry.companyId,
          exemptionReason: check.entry.exemptionReason,
          createdSource,
          createdByUserId: input?.createdByUserId ?? null,
        },
      );

      results.push({
        companyId: check.entry.companyId,
        expectedName: check.entry.expectedName,
        inserted: write.inserted,
        skippedExisting: !write.inserted,
        companyFound: true,
      });
    }

    await transaction.commit();
    return results;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // XACT_ABORT may already have aborted the transaction.
    }
    throw error;
  }
};