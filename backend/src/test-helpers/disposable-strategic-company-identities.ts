import sql from "mssql";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../constants/billing-company-exemption";
import {
  companyNamesMatchForExemption,
  normalizeCompanyId,
} from "../utils/billing/protected-company-exemption";

export class DisposableStrategicIdentityPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisposableStrategicIdentityPreparationError";
  }
}

const findCompanyById = async (
  pool: sql.ConnectionPool,
  companyId: string,
): Promise<{ id: string; name: string } | null> => {
  const row = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`SELECT id, name FROM dbo.companies WHERE id = @companyId`);
  const record = row.recordset[0] as { id: string; name: string } | undefined;
  return record ? { id: String(record.id), name: String(record.name) } : null;
};

/**
 * Rejects when a commercial name already belongs to a non-canonical UUID.
 * Never updates existing companies.
 */
export const assertNoStrategicIdentityHomonymCollision = async (
  pool: sql.ConnectionPool,
): Promise<void> => {
  const failures: string[] = [];

  for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
    const byId = await findCompanyById(pool, entry.companyId);
    if (byId && !companyNamesMatchForExemption(byId.name, entry.expectedName)) {
      failures.push(
        `Identity mismatch for ${entry.companyId}: expected "${entry.expectedName}", found "${byId.name}".`,
      );
    }

    const byName = await pool
      .request()
      .input("name", sql.NVarChar(200), entry.expectedName)
      .query(`
        SELECT id, name
        FROM dbo.companies
        WHERE LTRIM(RTRIM(name)) = LTRIM(RTRIM(@name))
      `);
    const homonym = byName.recordset[0] as { id: string; name: string } | undefined;
    if (
      homonym &&
      normalizeCompanyId(homonym.id) !== normalizeCompanyId(entry.companyId)
    ) {
      failures.push(
        `Homonym collision for "${entry.expectedName}": canonical UUID is ${entry.companyId}, found ${homonym.id}.`,
      );
    }
  }

  if (failures.length > 0) {
    throw new DisposableStrategicIdentityPreparationError(failures.join(" "));
  }
};

/** Inserts the three canonical strategic companies on an empty ephemeral database only. */
export const insertSyntheticStrategicCompanies = async (pool: sql.ConnectionPool): Promise<void> => {
  await assertNoStrategicIdentityHomonymCollision(pool);

  for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, entry.companyId)
      .input("name", sql.NVarChar(200), entry.expectedName)
      .query(`
        INSERT INTO dbo.companies (id, name, default_timezone, status)
        SELECT @companyId, @name, N'America/Argentina/Buenos_Aires', N'ACTIVE'
        WHERE NOT EXISTS (SELECT 1 FROM dbo.companies WHERE id = @companyId);
      `);
  }
};

export const assertSyntheticStrategicIdentitiesReady = async (
  pool: sql.ConnectionPool,
): Promise<void> => {
  await assertNoStrategicIdentityHomonymCollision(pool);

  for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
    const row = await findCompanyById(pool, entry.companyId);
    if (!row) {
      throw new DisposableStrategicIdentityPreparationError(
        `Missing synthetic company row for ${entry.companyId}.`,
      );
    }
    if (!companyNamesMatchForExemption(row.name, entry.expectedName)) {
      throw new DisposableStrategicIdentityPreparationError(
        `Synthetic identity mismatch for ${entry.companyId}.`,
      );
    }
  }
};