#!/usr/bin/env npx tsx
/**
 * Reconciliation report: projection vs ledger movements.
 * Usage: npx tsx --import ./src/test-helpers/preload-test-env.ts src/scripts/reconcile-absence-balance-ledger.ts
 */
import sql from "mssql";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrationEnv as env } from "../config/env-migrations";

const main = async (): Promise<void> => {
  const pool = await sql.connect({
    server: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    },
  });

  try {
    const result = await pool.request().query(`
      WITH movement_aggs AS (
        SELECT
          m.balance_id,
          m.company_id,
          SUM(CASE
            WHEN m.movement_type IN (N'INITIAL_GRANT', N'MANUAL_CREDIT', N'MIGRATION_ADJUSTMENT')
              AND m.direction = N'CREDIT' THEN m.quantity
            WHEN m.movement_type = N'MANUAL_DEBIT' AND m.direction = N'DEBIT' THEN -m.quantity
            ELSE 0
          END) AS ledgerGranted,
          SUM(CASE
            WHEN m.movement_type = N'RESERVE' THEN m.quantity
            WHEN m.movement_type = N'RELEASE' THEN -m.quantity
            ELSE 0
          END) AS ledgerReservedGross,
          SUM(CASE WHEN m.movement_type = N'CONSUME' THEN m.quantity ELSE 0 END) AS ledgerConsumed
        FROM dbo.employee_absence_balance_movements m
        GROUP BY m.balance_id, m.company_id
      ),
      consume_from_reserve AS (
        SELECT
          c.balance_id,
          c.company_id,
          SUM(c.quantity) AS consumedFromReserve
        FROM dbo.employee_absence_balance_movements c
        WHERE c.movement_type = N'CONSUME'
          AND EXISTS (
            SELECT 1
            FROM dbo.employee_absence_balance_movements r
            WHERE r.company_id = c.company_id
              AND r.absence_request_id = c.absence_request_id
              AND r.period_year = c.period_year
              AND r.movement_type = N'RESERVE'
          )
        GROUP BY c.balance_id, c.company_id
      )
      SELECT
        b.company_id AS companyId,
        b.employee_id AS employeeId,
        b.absence_type_id AS absenceTypeId,
        b.year AS year,
        b.granted_days AS projectedGranted,
        b.reserved_days AS projectedReserved,
        b.consumed_days AS projectedConsumed,
        ISNULL(a.ledgerGranted, 0) AS ledgerGranted,
        ISNULL(a.ledgerReservedGross, 0) - ISNULL(cfr.consumedFromReserve, 0) AS ledgerReserved,
        ISNULL(a.ledgerConsumed, 0) AS ledgerConsumed,
        b.granted_days - ISNULL(a.ledgerGranted, 0) AS differenceGranted,
        b.reserved_days - (ISNULL(a.ledgerReservedGross, 0) - ISNULL(cfr.consumedFromReserve, 0)) AS differenceReserved,
        b.consumed_days - ISNULL(a.ledgerConsumed, 0) AS differenceConsumed,
        CASE
          WHEN ABS(b.granted_days - ISNULL(a.ledgerGranted, 0)) < 0.05
           AND ABS(b.reserved_days - (ISNULL(a.ledgerReservedGross, 0) - ISNULL(cfr.consumedFromReserve, 0))) < 0.05
           AND ABS(b.consumed_days - ISNULL(a.ledgerConsumed, 0)) < 0.05
          THEN 'OK'
          ELSE 'DRIFT'
        END AS status
      FROM dbo.employee_absence_balances b
      LEFT JOIN movement_aggs a
        ON a.balance_id = b.id AND a.company_id = b.company_id
      LEFT JOIN consume_from_reserve cfr
        ON cfr.balance_id = b.id AND cfr.company_id = b.company_id
      ORDER BY status DESC, b.company_id, b.employee_id, b.year
    `);

    const rows = result.recordset;
    const drift = rows.filter((row) => row.status === "DRIFT");
    const lines = [
      `Absence balance ledger reconciliation`,
      `Generated: ${new Date().toISOString()}`,
      `Total accounts: ${rows.length}`,
      `Drift accounts: ${drift.length}`,
      "",
      ...drift.slice(0, 50).map(
        (row) =>
          `${row.companyId} | ${row.employeeId} | ${row.absenceTypeId} | ${row.year} | g:${row.projectedGranted}/${row.ledgerGranted} r:${row.projectedReserved}/${row.ledgerReserved} c:${row.projectedConsumed}/${row.ledgerConsumed} | ${row.status}`,
      ),
    ];
    const outPath = join(
      process.cwd(),
      "..",
      "review",
      "absence-phase-3-balances-reconciliation.txt",
    );
    writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
    console.log(lines.join("\n"));
    console.log(`Wrote ${outPath}`);
  } finally {
    await pool.close();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
