import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import { getPool } from "./connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const MIGRATION_054_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/054_employee_categories.sql",
);

const MIGRATION_055_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/055_employee_categories_company_scope_trigger.sql",
);

const SYSTEM_NAMES = ["Auxiliar", "Contador", "Encargado", "Operario", "Supervisor"] as const;

const splitBatches = (script: string): string[] =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const stripLegacyDatabaseUse = (batch: string): string =>
  batch
    .split(/\r?\n/)
    .filter((line) => !/^\s*USE\s+[A-Za-z0-9_[\]]+\s*;?\s*$/i.test(line.trim()))
    .join("\n")
    .trim();

const executeMigrationFile = async (path: string): Promise<void> => {
  const pool = getPool();
  const script = readFileSync(path, "utf8");
  for (const batch of splitBatches(script)) {
    const normalized = stripLegacyDatabaseUse(batch);
    if (!normalized) {
      continue;
    }
    await pool.request().query(normalized);
  }
};

describeDatabaseIntegration("employee categories migration 054/055", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("is re-executable and keeps exactly five system categories", async () => {
    const pool = getPool();

    await executeMigrationFile(MIGRATION_054_PATH);
    await executeMigrationFile(MIGRATION_055_PATH);
    await executeMigrationFile(MIGRATION_054_PATH);
    await executeMigrationFile(MIGRATION_055_PATH);

    const systemRows = await pool.request().query(`
      SELECT name, normalized_name, is_system, company_id, is_active
      FROM dbo.employee_categories
      WHERE company_id IS NULL AND is_system = 1
      ORDER BY name ASC
    `);

    assert.equal(systemRows.recordset.length, 5);
    assert.deepEqual(
      systemRows.recordset.map((row) => String(row.name)),
      [...SYSTEM_NAMES],
    );
    for (const row of systemRows.recordset) {
      assert.equal(row.company_id, null);
      assert.equal(Boolean(row.is_system), true);
      assert.equal(Boolean(row.is_active), true);
    }

    const indexes = await pool.request().query(`
      SELECT name
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.employee_categories')
        AND name IN (
          N'UQ_employee_categories_system_normalized_name',
          N'UQ_employee_categories_company_normalized_name',
          N'IX_employee_categories_company_active'
        )
    `);
    assert.equal(indexes.recordset.length, 3);

    const employeeIndex = await pool.request().query(`
      SELECT 1 AS present
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.employees')
        AND name = N'IX_employees_company_category'
    `);
    assert.ok(employeeIndex.recordset[0]?.present);

    const fk = await pool.request().query(`
      SELECT 1 AS present
      FROM sys.foreign_keys
      WHERE name = N'FK_employees_employee_category'
    `);
    assert.ok(fk.recordset[0]?.present);

    const trigger = await pool.request().query(`
      SELECT 1 AS present
      FROM sys.triggers
      WHERE name = N'TR_employees_category_company_scope'
        AND parent_id = OBJECT_ID(N'dbo.employees')
    `);
    assert.ok(trigger.recordset[0]?.present);

    const column = await pool.request().query(`
      SELECT 1 AS present
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.employees')
        AND name = N'category_id'
    `);
    assert.ok(column.recordset[0]?.present);
  });

  it("documents rollback guidance in migration headers", () => {
    const migration054 = readFileSync(MIGRATION_054_PATH, "utf8");
    const migration055 = readFileSync(MIGRATION_055_PATH, "utf8");
    assert.match(migration054, /Rollback/i);
    assert.match(migration054, /TR_employees_category_company_scope/);
    assert.match(migration055, /Rollback/i);
    assert.match(migration055, /DROP TRIGGER TR_employees_category_company_scope/);
  });
});
