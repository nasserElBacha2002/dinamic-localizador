/**
 * Explicitly enable absence balance ledger for one company after reconciliation checks.
 *
 * Usage:
 *   npx tsx --import ./src/test-helpers/preload-test-env.ts \
 *     src/scripts/enable-absence-balance-ledger.ts --company=<uuid>
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

  const drift = await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    SELECT COUNT(1) AS drift_count
    FROM dbo.employee_absence_balances b
    WHERE b.company_id = @companyId
      AND ABS(
        b.available_days - (b.granted_days - b.reserved_days - b.consumed_days)
      ) >= 0.05
  `);
  const driftCount = Number(drift.recordset[0]?.drift_count ?? 0);
  if (driftCount > 0) {
    throw new Error(`Cannot enable ledger: ${driftCount} projection invariant drifts`);
  }

  const negatives = await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    SELECT COUNT(1) AS neg_count
    FROM dbo.employee_absence_balances
    WHERE company_id = @companyId
      AND (granted_days < 0 OR reserved_days < 0 OR consumed_days < 0 OR available_days < 0)
  `);
  if (Number(negatives.recordset[0]?.neg_count ?? 0) > 0) {
    throw new Error("Cannot enable ledger: negative projection values found");
  }

  const dupes = await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    SELECT COUNT(1) AS dupe_groups
    FROM (
      SELECT idempotency_key
      FROM dbo.employee_absence_balance_movements
      WHERE company_id = @companyId
      GROUP BY idempotency_key
      HAVING COUNT(1) > 1
    ) d
  `);
  if (Number(dupes.recordset[0]?.dupe_groups ?? 0) > 0) {
    throw new Error("Cannot enable ledger: duplicate idempotency keys found");
  }

  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    UPDATE dbo.company_settings
    SET absence_balance_ledger_enabled = 1
    WHERE company_id = @companyId
  `);

  await auditService.log(companyId, {
    entityType: "company_settings",
    entityId: companyId,
    action: "ABSENCE_BALANCE_LEDGER_ENABLED",
    newData: { absenceBalanceLedgerEnabled: true },
    reason: "enable-absence-balance-ledger script",
    userId: null,
  });

  console.log(`Ledger enabled for company ${companyId}`);
  await closeDatabase();
};

main().catch(async (error) => {
  console.error(error);
  try {
    await closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
