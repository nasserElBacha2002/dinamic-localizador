import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { connectDatabase, closeDatabase } from "../database/connection";
import { employeeRepository } from "../repositories/employees/employee.repository";
import { employeeService } from "../services/employees/employee.service";
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

function resolveSeedCompanyId(): string {
  const companyId = process.env.SEED_COMPANY_ID?.trim();
  if (!companyId) {
    throw new Error(
      "seed-employees requires SEED_COMPANY_ID (target company UUID). " +
        "Employees are created/updated via employeeService with commercial seat quota invariants.",
    );
  }
  return companyId;
}

const main = async (): Promise<void> => {
  const companyId = resolveSeedCompanyId();
  const content = readFileSync(SEED_FILE, "utf8");
  const employees = parseSeedFile(content);

  if (employees.length === 0) {
    throw new Error(`No employees parsed from ${SEED_FILE}`);
  }

  await connectDatabase();
  let inserted = 0;
  let updated = 0;
  let reactivated = 0;

  try {
    for (const employee of employees) {
      const existing = await employeeRepository.findByPhone(companyId, employee.phoneNumber);
      if (!existing) {
        await employeeService.create(companyId, {
          name: employee.name,
          phoneNumber: employee.phoneNumber,
          employeeType: "fijo",
        });
        inserted += 1;
        continue;
      }

      if (!existing.active) {
        await employeeService.update(companyId, existing.id, {
          name: employee.name,
          active: true,
        });
        reactivated += 1;
        continue;
      }

      if (existing.name !== employee.name) {
        await employeeService.update(companyId, existing.id, {
          name: employee.name,
        });
        updated += 1;
      }
    }
  } finally {
    await closeDatabase();
  }

  // eslint-disable-next-line no-console -- CLI script output
  console.log(
    JSON.stringify({
      companyId,
      inserted,
      updated,
      reactivated,
      total: employees.length,
    }),
  );
};

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- CLI script output
  console.error(error);
  process.exit(1);
});