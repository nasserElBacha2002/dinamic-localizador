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

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const insertEmployee = async (suffix: number): Promise<string> => {
      const phone = `+54911${Date.now().toString().slice(-7)}${suffix}`;
      const row = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("name", sql.NVarChar(200), `Rollback152 Emp ${suffix}`)
        .input("phone", sql.NVarChar(20), phone)
        .query(`
          DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
          INSERT INTO employees (company_id, name, phone_number, employee_type, active)
          OUTPUT INSERTED.id INTO @inserted (id)
          VALUES (@companyId, @name, @phone, N'fijo', 1);
          SELECT id FROM @inserted;
        `);
      return String(row.recordset[0].id);
    };

    const replacementA = await insertEmployee(1);
    const replacementB = await insertEmployee(2);

    const start = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
    const operationRow = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("startAt", sql.DateTime2, start)
      .input("endAt", sql.DateTime2, end)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end, status
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @serviceId, N'ONE_TIME', @startAt, @endAt, N'SCHEDULED');
        SELECT id FROM @inserted;
      `);
    const operationId = String(operationRow.recordset[0].id);

    const { operationAssignmentService } = await import(
      "../services/operations/operation-assignment.service"
    );
    const { operationWorkDateService } = await import(
      "../services/operations/operation-work-date.service"
    );
    const { workdayMaterializationService } = await import(
      "../services/workdays/workday-materialization.service"
    );
    const workDate = await operationWorkDateService.resolveOperationWorkDate(companyId, operationId);
    await operationAssignmentService.assignEmployee(companyId, operationId, replacementA, {
      validFrom: workDate,
      validUntil: workDate,
    });
    await operationAssignmentService.assignEmployee(companyId, operationId, replacementB, {
      validFrom: workDate,
      validUntil: workDate,
    });
    const workdayA = (
      await workdayMaterializationService.ensureEmployeeWorkday(
        companyId,
        operationId,
        replacementA,
      )
    ).id;
    const workdayB = (
      await workdayMaterializationService.ensureEmployeeWorkday(
        companyId,
        operationId,
        replacementB,
      )
    ).id;

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
