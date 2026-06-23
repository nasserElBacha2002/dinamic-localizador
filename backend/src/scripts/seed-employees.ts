import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import sql from "mssql";
import { connectDatabase, closeDatabase } from "../database/connection";
import { normalizePhoneNumber } from "../utils/phone";

config();

interface EmployeeRow {
  name: string;
  phoneNumber: string;
}

const SEED_FILE = join(process.cwd(), "..", "database", "seeds", "employees_production.tsv");

function normalizeSeedPhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return normalizePhoneNumber(withPlus);
}

function parseSeedFile(content: string): EmployeeRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [header, ...rows] = lines;
  if (!header?.toLowerCase().includes("nombre")) {
    throw new Error("Invalid seed file: missing header row.");
  }

  const employees: EmployeeRow[] = [];

  for (const line of rows) {
    const tabIndex = line.indexOf("\t");
    if (tabIndex === -1) {
      continue;
    }

    const name = line.slice(0, tabIndex).trim();
    const rawPhone = line.slice(tabIndex + 1).trim();

    if (!name || !rawPhone) {
      continue;
    }

    employees.push({
      name: name.slice(0, 150),
      phoneNumber: normalizeSeedPhone(rawPhone),
    });
  }

  return employees;
}

async function upsertEmployee(
  pool: sql.ConnectionPool,
  employee: EmployeeRow,
): Promise<"inserted" | "updated"> {
  const result = await pool
    .request()
    .input("name", sql.NVarChar(150), employee.name)
    .input("phoneNumber", sql.NVarChar(30), employee.phoneNumber)
    .query(`
      MERGE employees AS target
      USING (
        SELECT
          @name AS name,
          @phoneNumber AS phone_number
      ) AS source
      ON target.phone_number = source.phone_number
      WHEN MATCHED THEN
        UPDATE SET
          name = source.name,
          active = 1,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (name, phone_number, document_number, active)
        VALUES (source.name, source.phone_number, NULL, 1)
      OUTPUT $action AS action;
    `);

  const action = String(result.recordset[0]?.action ?? "");
  return action === "UPDATE" ? "updated" : "inserted";
}

const main = async (): Promise<void> => {
  const content = readFileSync(SEED_FILE, "utf8");
  const employees = parseSeedFile(content);

  if (employees.length === 0) {
    throw new Error(`No employees parsed from ${SEED_FILE}`);
  }

  const pool = await connectDatabase();
  let inserted = 0;
  let updated = 0;

  try {
    for (const employee of employees) {
      const action = await upsertEmployee(pool, employee);
      if (action === "inserted") {
        inserted += 1;
      } else {
        updated += 1;
      }
    }
  } finally {
    await closeDatabase();
  }

  console.log(`Employees seed completed: ${inserted} inserted, ${updated} updated (${employees.length} total).`);
};

void main().catch((error) => {
  console.error("Failed to seed employees:", error);
  process.exit(1);
});
