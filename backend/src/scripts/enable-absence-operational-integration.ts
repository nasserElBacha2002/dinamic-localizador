/**
 * Enable Phase 5 absence operational integration for one company.
 *
 * Usage:
 *   npx tsx --import ./src/test-helpers/preload-test-env.ts \
 *     src/scripts/enable-absence-operational-integration.ts --company=<uuid>
 *
 * Preconditions:
 *   - Migration 069 applied (absence_operational_* tables + flag column)
 *   - Company settings row exists
 */
import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import { auditService } from "../services/audit.service";

const parseCompanyId = (): string => {
  const arg = process.argv.find((item) => item.startsWith("--company="));
  const value = arg?.slice("--company=".length)?.trim();
  if (!value) {
    throw new Error("Missing --company=<uuid>");
  }
  return value;
};

const main = async (): Promise<void> => {
  const companyId = parseCompanyId();
  await connectDatabase();
  const pool = getPool();

  const tables = await pool.request().query(`
    SELECT
      OBJECT_ID('dbo.absence_operational_effects', 'U') AS effects_id,
      OBJECT_ID('dbo.absence_operational_conflicts', 'U') AS conflicts_id,
      COL_LENGTH('dbo.company_settings', 'absence_operational_integration_enabled') AS flag_col
  `);
  const row = tables.recordset[0] as {
    effects_id: unknown;
    conflicts_id: unknown;
    flag_col: unknown;
  };
  if (!row.effects_id || !row.conflicts_id || row.flag_col == null) {
    throw new Error(
      "Preconditions failed: apply migration 069_absence_phase5_operational_integration.sql first",
    );
  }

  const settings = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`SELECT company_id FROM company_settings WHERE company_id = @companyId`);
  if (!settings.recordset[0]) {
    throw new Error(`company_settings not found for company ${companyId}`);
  }

  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    UPDATE company_settings
    SET absence_operational_integration_enabled = 1,
        updated_at = SYSUTCDATETIME()
    WHERE company_id = @companyId
  `);

  await auditService.log(companyId, {
    entityType: "company_settings",
    entityId: companyId,
    action: "ENABLE_ABSENCE_OPERATIONAL_INTEGRATION",
    newData: { absenceOperationalIntegrationEnabled: true },
  });

  console.info(`absence_operational_integration_enabled=1 for company ${companyId}`);
  await closeDatabase();
};

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    await closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
