/**
 * Purge every company except the configured Dinamic Systems tenant.
 *
 * Usage (backend/):
 *   npx tsx src/scripts/purge-other-companies-local.ts --dry-run
 *   npx tsx src/scripts/purge-other-companies-local.ts --confirm
 */
import { config } from "dotenv";
import sql from "mssql";
import { closeDatabase, connectDatabase, getPool } from "../database/connection";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";

config();

const DINAMIC_SYSTEMS_COMPANY_ID = "A0ECDC4C-1541-407F-BB2F-5D4992D4920B";

const dryRun = process.argv.includes("--dry-run");
const confirm = process.argv.includes("--confirm");

const main = async (): Promise<void> => {
  if (!dryRun && !confirm) {
    console.error("Use --dry-run or --confirm");
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  const pool = getPool();

  try {
    const dinamic = await pool
      .request()
      .input("id", sql.UniqueIdentifier, DINAMIC_SYSTEMS_COMPANY_ID)
      .query(`SELECT CAST(id AS nvarchar(36)) AS id, name FROM companies WHERE id = @id`);

    if (!dinamic.recordset[0]) {
      throw new Error(`Company not found: ${DINAMIC_SYSTEMS_COMPANY_ID}`);
    }

    console.log("Keeping:", dinamic.recordset[0]);

    const others = await pool
      .request()
      .input("id", sql.UniqueIdentifier, DINAMIC_SYSTEMS_COMPANY_ID)
      .query(`
        SELECT CAST(id AS nvarchar(36)) AS id, name
        FROM companies
        WHERE id <> @id
        ORDER BY name
      `);

    console.log(`Other companies (${others.recordset.length}):`);
    for (const row of others.recordset as Array<{ id: string; name: string }>) {
      console.log(`  ${row.name} | ${row.id}`);
    }

    if (dryRun) {
      console.log("DRY RUN — no changes");
      return;
    }

    for (const row of others.recordset as Array<{ id: string; name: string }>) {
      const companyId = row.id;
      console.log(`Deleting ${row.name} (${companyId})…`);
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        UPDATE operational_locations SET client_id = NULL WHERE company_id = @companyId;
        DELETE FROM employee_clients WHERE company_id = @companyId;
        DELETE FROM clients WHERE company_id = @companyId;
      `);
      await deleteCompanyCascade(companyId);
    }

    const remaining = await pool.request().query(`
      SELECT CAST(id AS nvarchar(36)) AS id, name FROM companies ORDER BY name
    `);
    console.log("Companies after purge:", remaining.recordset);
  } finally {
    await closeDatabase();
  }
};

main().catch(async (error) => {
  console.error(error);
  try {
    await closeDatabase();
  } catch {
    // ignore
  }
  process.exit(1);
});
