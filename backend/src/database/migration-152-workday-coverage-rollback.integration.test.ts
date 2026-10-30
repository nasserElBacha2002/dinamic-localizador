/**
 * Migration 152 workday-scoped coverage rollback (real SQL Server execution).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "./connection";
import {
  applySqlScriptInTransaction,
  splitBatches,
  stripLegacyDatabaseUse,
} from "./run-migrations";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const readRollback152 = (): string =>
  readFileSync(
    join(migrationsDir, "rollback", "152_workday_scoped_operation_coverage_rollback.sql"),
    "utf8",
  );

const readForward152 = (): string =>
  readFileSync(join(migrationsDir, "152_workday_scoped_operation_coverage.sql"), "utf8");

const columnExists = async (column: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("column", sql.NVarChar(128), column)
    .query(`
      SELECT COL_LENGTH(N'dbo.operation_coverage_events', @column) AS len
    `);
  return result.recordset[0]?.len != null;
};

const indexExists = async (name: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(128), name)
    .query(`
      SELECT 1 AS found
      FROM sys.indexes
      WHERE name = @name AND object_id = OBJECT_ID(N'dbo.operation_coverage_events')
    `);
  return Boolean(result.recordset[0]);
};

const fkExists = async (name: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(128), name)
    .query(`SELECT 1 AS found FROM sys.foreign_keys WHERE name = @name`);
  return Boolean(result.recordset[0]);
};

const globalRollbackPreflightPasses = async (): Promise<boolean> => {
  const result = await getPool().request().query(`
    SELECT TOP 1 1 AS blocked
    FROM dbo.operation_coverage_events
    WHERE replaced_assignment_id IS NOT NULL
    GROUP BY company_id, replaced_assignment_id
    HAVING COUNT(*) > 1
  `);
  return !result.recordset[0];
};

const assertSchema152 = async (): Promise<void> => {
  assert.equal(await columnExists("absent_employee_workday_id"), true);
  assert.equal(await columnExists("coverage_command_id"), true);
  assert.equal(await columnExists("superseded_at"), true);
  assert.equal(await fkExists("FK_oce_absent_employee_workday"), true);
  assert.equal(await indexExists("UQ_oce_company_active_workday"), true);
  assert.equal(await indexExists("UQ_oce_company_coverage_command"), true);
};

const assertSchemaLegacyCoverage = async (): Promise<void> => {
  assert.equal(await columnExists("absent_employee_workday_id"), false);
  assert.equal(await columnExists("coverage_command_id"), false);
  assert.equal(await columnExists("superseded_at"), false);
  assert.equal(await fkExists("FK_oce_absent_employee_workday"), false);
  assert.equal(await indexExists("UQ_oce_company_active_workday"), false);
  assert.equal(await indexExists("UQ_oce_company_coverage_command"), false);
  assert.equal(await indexExists("UQ_oce_company_replaced_assignment_legacy"), false);
  assert.equal(await indexExists("UQ_oce_company_replaced_assignment"), true);
};

describeDatabaseIntegration("migration 152 workday coverage rollback", () => {
  let rollbackAppliedInSuite = false;

  before(async () => {
    await setupDatabaseIntegration();
    await assertSchema152();
  });

  after(async () => {
    if (rollbackAppliedInSuite) {
      await applySqlScriptInTransaction(getPool(), readForward152());
    }
    await teardownDatabaseIntegration();
  });

  it("source script runs preflight before dropping columns or creating legacy index", () => {
    const script = readRollback152();
    const preflightThrow = script.indexOf("THROW");
    const dropSuperseded = script.indexOf("DROP COLUMN superseded_at");
    const createLegacy = script.indexOf("CREATE UNIQUE INDEX UQ_oce_company_replaced_assignment");
    assert.ok(preflightThrow >= 0);
    assert.ok(dropSuperseded > preflightThrow);
    assert.ok(createLegacy > dropSuperseded);
  });

  it("Case B — incompatible data aborts in transaction without schema changes", async () => {
    const pool = getPool();
    const company = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const operation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM scheduled_operations WHERE company_id = @companyId ORDER BY created_at DESC
      `);
    const operationId = String(operation.recordset[0]?.id ?? "");
    assert.ok(operationId);

    const employees = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 2 id FROM employees WHERE company_id = @companyId AND active = 1
      `);
    assert.ok(employees.recordset.length >= 2);
    const replacementA = String(employees.recordset[0].id);
    const replacementB = String(employees.recordset[1].id);

    const workdays = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 2 ew.id
        FROM employee_workdays ew
        WHERE ew.company_id = @companyId
        ORDER BY ew.created_at DESC
      `);
    assert.ok(workdays.recordset.length >= 2);
    const workdayA = String(workdays.recordset[0].id);
    const workdayB = String(workdays.recordset[1].id);

    const sharedAssignmentId = randomUUID();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let threw = false;
    try {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("assignmentId", sql.UniqueIdentifier, sharedAssignmentId)
        .input("replacementA", sql.UniqueIdentifier, replacementA)
        .input("replacementB", sql.UniqueIdentifier, replacementB)
        .input("workdayA", sql.UniqueIdentifier, workdayA)
        .input("workdayB", sql.UniqueIdentifier, workdayB)
        .query(`
          INSERT INTO operation_coverage_events (
            company_id, operation_id, operational_date, source_type,
            replaced_assignment_id, replacement_employee_id,
            absent_employee_workday_id, coverage_command_id
          )
          VALUES
            (@companyId, @operationId, CAST(GETDATE() AS DATE), N'MANUAL_COVERAGE',
             @assignmentId, @replacementA, @workdayA, N'rollback-incompat-a'),
            (@companyId, @operationId, CAST(GETDATE() AS DATE), N'MANUAL_COVERAGE',
             @assignmentId, @replacementB, @workdayB, N'rollback-incompat-b');
        `);

      for (const batch of splitBatches(readRollback152())) {
        const sqlText = stripLegacyDatabaseUse(batch);
        if (sqlText.length > 0) {
          await new sql.Request(transaction).query(sqlText);
        }
      }
    } catch (error) {
      threw = true;
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /Rollback 152 blocked/i);
    } finally {
      await transaction.rollback();
    }
    assert.equal(threw, true);
    await assertSchema152();
  });

  it("Case A — compatible database executes rollback then restores forward 152", async () => {
    const pool = getPool();
    await pool.request().query(`
      DELETE FROM dbo.operation_coverage_events
    `);
    assert.equal(
      await globalRollbackPreflightPasses(),
      true,
      "operation_coverage_events must be legacy-compatible before rollback (at most one row per company_id + replaced_assignment_id)",
    );

    await applySqlScriptInTransaction(pool, readRollback152());
    rollbackAppliedInSuite = true;
    await assertSchemaLegacyCoverage();

    await applySqlScriptInTransaction(pool, readForward152());
    rollbackAppliedInSuite = false;
    await assertSchema152();
  });
});
