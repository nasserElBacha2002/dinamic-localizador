/**
 * One-shot cleanup of integration-test leftovers in the local/dev database.
 *
 * Deletes:
 * - Employees in Dinamic Systems matching known test fixture names
 * - Scheduled operations in Dinamic Systems that have no assignments to real employees
 * - Empty leftover companies named like Integration Test Co / Backfill Co / Isolation Test Co
 *
 * Preserves:
 * - Real Dinamic Systems employees (by name exclusion)
 * - Operations that still have at least one assignment to a non-test employee
 * - Companies such as Dinamic Systems and user-created ones (e.g. prueba-nasser)
 *
 * Usage (from backend/):
 *   set -a && source .env && set +a && npx tsx src/scripts/cleanup-integration-junk.ts
 *   npx tsx src/scripts/cleanup-integration-junk.ts --dry-run
 */
import { config } from "dotenv";
import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import {
  deleteCompanyCascade,
  deleteEmployeeCascade,
  deleteOperationCascade,
} from "../test-helpers/integration-cleanup";

config();

const dryRun = process.argv.includes("--dry-run");

const TEST_EMPLOYEE_PREDICATE = `
  (
    e.name IN (
      N'Emp A', N'Emp B', N'Emp C', N'Emp Pending', N'Emp Confirmed', N'Emp Unavailable',
      N'Cycle Integration', N'Recovery Integration', N'Recovery Repo',
      N'Reassign Persistence', N'Recurring Reassign',
      N'Confirmed Reset', N'Unavailable Reset', N'Pending Reset', N'Rollback Integration',
      N'Integration Reset', N'Trig Bypass'
    )
    OR e.name LIKE N'Emp %'
    OR e.name LIKE N'% Integration'
    OR e.name LIKE N'% Reassign'
    OR e.name LIKE N'% Reset'
    OR e.name LIKE N'Recovery %'
  )
`;

const isJunkOperationPredicate = `
  NOT EXISTS (
    SELECT 1
    FROM operation_assignments oa
    INNER JOIN employees e ON e.id = oa.employee_id
    WHERE oa.operation_id = o.id
      AND NOT ${TEST_EMPLOYEE_PREDICATE}
  )
`;

const main = async (): Promise<void> => {
  await connectDatabase();
  const pool = getPool();

  try {
    const dinamic = await pool.request().query(`
      SELECT id FROM companies WHERE name = N'Dinamic Systems'
    `);
    const dinamicCompanyId = String(dinamic.recordset[0]?.id ?? "");
    if (!dinamicCompanyId) {
      throw new Error("Dinamic Systems company not found");
    }

    const junkOps = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, dinamicCompanyId)
      .query(`
        SELECT o.id
        FROM scheduled_operations o
        WHERE o.company_id = @companyId
          AND ${isJunkOperationPredicate}
      `);

    const junkEmployees = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, dinamicCompanyId)
      .query(`
        SELECT e.id, e.name
        FROM employees e
        WHERE e.company_id = @companyId
          AND ${TEST_EMPLOYEE_PREDICATE}
      `);

    const junkCompanies = await pool.request().query(`
      SELECT c.id, c.name
      FROM companies c
      WHERE c.name LIKE N'Integration Test Co%'
         OR c.name LIKE N'Backfill Co%'
         OR c.name = N'Isolation Test Co'
    `);

    console.log(
      JSON.stringify(
        {
          dryRun,
          junkOperations: junkOps.recordset.length,
          junkEmployees: junkEmployees.recordset.length,
          junkCompanies: junkCompanies.recordset.map((row: { name: string }) => row.name),
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      return;
    }

    for (const row of junkOps.recordset as Array<{ id: string }>) {
      await deleteOperationCascade(dinamicCompanyId, String(row.id));
    }

    for (const row of junkEmployees.recordset as Array<{ id: string }>) {
      await deleteEmployeeCascade(dinamicCompanyId, String(row.id));
    }

    for (const row of junkCompanies.recordset as Array<{ id: string }>) {
      await deleteCompanyCascade(String(row.id));
    }

    const remaining = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, dinamicCompanyId)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM employees WHERE company_id = @companyId) AS employees,
          (SELECT COUNT(*) FROM scheduled_operations WHERE company_id = @companyId) AS operations
      `);
    console.log("Dinamic Systems remaining:", remaining.recordset[0]);
  } finally {
    await closeDatabase();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
