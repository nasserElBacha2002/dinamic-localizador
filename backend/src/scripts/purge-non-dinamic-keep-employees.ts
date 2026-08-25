/**
 * Keep Dinamic Systems employees matching the provided phone list; purge the rest.
 * Matches by phone because pasted UUIDs may come from another environment.
 *
 * Usage (backend/):
 *   npx tsx src/scripts/purge-non-dinamic-keep-employees.ts --dry-run
 *   npx tsx src/scripts/purge-non-dinamic-keep-employees.ts --confirm
 */
import { config } from "dotenv";
import sql from "mssql";
import { closeDatabase, connectDatabase, getPool } from "../database/connection";
import {
  deleteCompanyCascade,
  deleteEmployeeCascade,
} from "../test-helpers/integration-cleanup";

config();

/** Phones from the user-provided Dinamic Systems roster (E.164). */
const KEEP_PHONES = [
  "+5491156511107", // Mauricio Hernandez Ultimo
  "+5491123682695", // Kike Mercado
  "+5491156199583", // Jony
  "+5492615896136", // Daiana Rivarola
  "+5491164403059", // Cristian Cisneros
  "+5491139455202", // Lautaro Rojo
  "+5491139526563", // Nasser El Bacha / Nasser - Prueba (same phone in paste)
  "+5491135878760", // Santiago Gutierrez
  "+5491130583121", // Esteban Luis
  "+5491169736744", // Matias Sanchez
  "+5491164645686", // Pia Valentina
  "+5491144263813", // Hassan
  "+5491121869972", // Isaac Duarte
  "+5491149393031", // Yibril El Bacha
  "+5491154159146", // Kato Nuevo
  "+5491166609812", // Nicolas Valenzuela
  "+5491162539491", // Javier Giles
  "+5491158454703", // Jose Cisneros Nuevo
  "+5491157533095", // Pablo Cisneros
  "+5491164351446", // Pablo Meza
  "+5491139099498", // Cintia David
  "+5491161713788", // Gonzalo Daniel Romano
  "+5491155680519", // Agustin Mercado
  "+5491133486262", // Dalma Garro
] as const;

const dryRun = process.argv.includes("--dry-run");
const confirm = process.argv.includes("--confirm");

const main = async (): Promise<void> => {
  if (!dryRun && !confirm) {
    console.error("Refusing to run without --dry-run or --confirm");
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  const pool = getPool();

  try {
    const companies = await pool.request().query(`
      SELECT CAST(id AS nvarchar(36)) AS id, name
      FROM companies
      ORDER BY name
    `);

    const dinamic = companies.recordset.find(
      (row: { name: string }) => row.name === "Dinamic Systems",
    ) as { id: string; name: string } | undefined;
    if (!dinamic) {
      throw new Error("Dinamic Systems company not found");
    }
    const dinamicId = dinamic.id;
    console.log("Dinamic Systems id:", dinamicId);
    console.log(`Companies total: ${companies.recordset.length}`);

    const keepPhoneSet = new Set(KEEP_PHONES.map((p) => p.trim()));

    const allEmployees = await pool.request().query(`
      SELECT
        CAST(id AS nvarchar(36)) AS id,
        CAST(company_id AS nvarchar(36)) AS company_id,
        name,
        phone_number,
        active
      FROM employees
      ORDER BY name
    `);

    const keepRows = allEmployees.recordset.filter((row: { phone_number: string | null }) =>
      keepPhoneSet.has(String(row.phone_number ?? "").trim()),
    );
    const deleteRows = allEmployees.recordset.filter(
      (row: { phone_number: string | null }) =>
        !keepPhoneSet.has(String(row.phone_number ?? "").trim()),
    );

    console.log(`Keep phones configured: ${KEEP_PHONES.length}`);
    console.log(`Keep employees found: ${keepRows.length}`);
    console.log(
      "Keep list:",
      keepRows.map(
        (r: { name: string; phone_number: string; id: string; company_id: string }) =>
          `${r.name} | ${r.phone_number} | ${r.id} | company=${r.company_id}`,
      ),
    );

    const missingPhones = KEEP_PHONES.filter(
      (phone) =>
        !keepRows.some(
          (row: { phone_number: string | null }) => String(row.phone_number ?? "").trim() === phone,
        ),
    );
    if (missingPhones.length > 0) {
      console.warn("Keep phones not found in DB:", missingPhones);
    }

    console.log(`Employees to delete: ${deleteRows.length}`);

    const otherCompanies = companies.recordset.filter(
      (row: { id: string }) => String(row.id).toUpperCase() !== dinamicId.toUpperCase(),
    ) as Array<{ id: string; name: string }>;
    console.log(`Other companies to delete: ${otherCompanies.length}`);

    if (dryRun) {
      console.log("DRY RUN — no changes applied");
      return;
    }

    for (const row of keepRows as Array<{
      id: string;
      company_id: string;
      name: string;
    }>) {
      if (String(row.company_id).toUpperCase() === dinamicId.toUpperCase()) {
        continue;
      }
      console.log(`Moving ${row.name} (${row.id}) → Dinamic Systems`);
      await pool
        .request()
        .input("employeeId", sql.UniqueIdentifier, row.id)
        .input("companyId", sql.UniqueIdentifier, dinamicId)
        .query(`
          UPDATE employees
          SET company_id = @companyId, updated_at = SYSUTCDATETIME()
          WHERE id = @employeeId
        `);
    }

    // Prefer company-level purge for non-Dinamic tenants (covers all employee FKs).
    for (const company of otherCompanies) {
      console.log(`Deleting company ${company.name} (${company.id})`);
      await deleteCompanyCascade(company.id);
    }

    // Remaining non-keep employees should only be under Dinamic Systems.
    const remainingToDelete = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, dinamicId)
      .query(`
        SELECT CAST(id AS nvarchar(36)) AS id, name, phone_number
        FROM employees
        WHERE company_id = @companyId
      `);

    for (const row of remainingToDelete.recordset as Array<{
      id: string;
      name: string;
      phone_number: string | null;
    }>) {
      if (keepPhoneSet.has(String(row.phone_number ?? "").trim())) {
        continue;
      }
      console.log(`Deleting Dinamic employee ${row.name} (${row.id})`);
      await deleteEmployeeCascade(dinamicId, row.id);
    }

    const afterCompanies = await pool.request().query(`
      SELECT CAST(id AS nvarchar(36)) AS id, name FROM companies ORDER BY name
    `);
    const afterEmp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, dinamicId)
      .query(`
        SELECT CAST(id AS nvarchar(36)) AS id, name, phone_number, active
        FROM employees
        WHERE company_id = @companyId
        ORDER BY name
      `);

    console.log("Companies after:", afterCompanies.recordset);
    console.log("Dinamic employees after:");
    for (const e of afterEmp.recordset) {
      console.log(`  ${e.name} | ${e.phone_number} | active=${e.active}`);
    }
    console.log(`Done. Companies=${afterCompanies.recordset.length}, employees=${afterEmp.recordset.length}`);
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
