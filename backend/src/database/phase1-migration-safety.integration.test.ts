/**
 * Phase 1 corrections — migration runner atomicity + 087/088 forward/rollback.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "./connection";
import {
  applySqlScriptInTransaction,
  splitBatches,
  stripLegacyDatabaseUse,
} from "./run-migrations";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const readMigration = (name: string): string =>
  readFileSync(join(migrationsDir, name), "utf8");

const readRollback = (name: string): string =>
  readFileSync(join(migrationsDir, "rollback", name), "utf8");

const fkExists = async (name: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(256), name)
    .query(`SELECT 1 AS found FROM sys.foreign_keys WHERE name = @name`);
  return Boolean(result.recordset[0]);
};

const columnNullable = async (table: string, column: string): Promise<boolean | null> => {
  const result = await getPool()
    .request()
    .input("table", sql.NVarChar(256), table)
    .input("column", sql.NVarChar(256), column)
    .query(`
      SELECT c.is_nullable
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID(@table) AND c.name = @column
    `);
  if (!result.recordset[0]) {
    return null;
  }
  return Boolean(result.recordset[0].is_nullable);
};

describeDatabaseIntegration("phase1 migration runner atomicity and rollback", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    // Leave shared local DB in post-087+088 shape even if a rollback cycle failed mid-way.
    try {
      const pool = getPool();
      await applySqlScriptInTransaction(pool, readMigration("087_phase1_tenant_composite_fks.sql"));
      await applySqlScriptInTransaction(pool, readMigration("088_phase1_work_team_members_contract.sql"));
    } catch (error) {
      console.warn("[phase1-migration-safety] schema restore failed", error);
    }
    await teardownDatabaseIntegration();
  });

  it("splitBatches separates on GO lines", () => {
    const batches = splitBatches("SELECT 1;\nGO\nSELECT 2;\nGO\n");
    assert.equal(batches.length, 2);
    assert.ok(batches[0].includes("SELECT 1"));
    assert.ok(batches[1].includes("SELECT 2"));
  });

  it("failure mid-script rolls back all batches in one transaction", async () => {
    const pool = getPool();
    const probe = `dbo.__phase1_tx_probe_${Date.now().toString(36)}`;
    const script = `
CREATE TABLE ${probe} (id INT NOT NULL);
GO
INSERT INTO ${probe} (id) VALUES (1);
GO
THROW 59991, 'injected phase1 migration failure', 1;
GO
`;

    await assert.rejects(
      () => applySqlScriptInTransaction(pool, script),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "number" in error &&
            (error as { number?: number }).number === 59991,
        ),
    );

    const exists = await pool.request().query(`
      SELECT OBJECT_ID(N'${probe}', N'U') AS oid
    `);
    assert.equal(exists.recordset[0].oid, null, "partial DDL must not survive failed transaction");
  });

  it("failure after DROP CONSTRAINT rolls back (no hybrid FK state)", async () => {
    const pool = getPool();
    assert.equal(await fkExists("FK_attendance_records_employee_company"), true);

    const script = `
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_attendance_records_employee_company')
    ALTER TABLE dbo.attendance_records DROP CONSTRAINT FK_attendance_records_employee_company;
GO
THROW 59992, 'injected after drop fk', 1;
GO
`;

    await assert.rejects(
      () => applySqlScriptInTransaction(pool, script),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "number" in error &&
            (error as { number?: number }).number === 59992,
        ),
    );

    assert.equal(
      await fkExists("FK_attendance_records_employee_company"),
      true,
      "dropped composite FK must be restored by transaction rollback",
    );
  });

  it("088 contract is applied (or already contracted) with NOT NULL company_id", async () => {
    const nullable = await columnNullable("dbo.work_team_members", "company_id");
    assert.equal(nullable, false, "after 088 contract company_id must be NOT NULL");
    assert.equal(await fkExists("FK_work_team_members_employee_company"), true);
    assert.equal(await fkExists("FK_work_team_members_team_company"), true);
  });

  it("forward → rollback 088 → forward 088 restores member composites", async () => {
    const pool = getPool();

    // Ensure 088 objects present first.
    assert.equal(await fkExists("FK_work_team_members_employee_company"), true);

    await applySqlScriptInTransaction(pool, readRollback("088_phase1_work_team_members_contract_rollback.sql"));
    assert.equal(await fkExists("FK_work_team_members_employee_company"), false);
    assert.equal(await fkExists("FK_work_team_members_employee"), true);
    assert.equal(await columnNullable("dbo.work_team_members", "company_id"), true);

    await applySqlScriptInTransaction(pool, readMigration("088_phase1_work_team_members_contract.sql"));
    assert.equal(await fkExists("FK_work_team_members_employee_company"), true);
    assert.equal(await columnNullable("dbo.work_team_members", "company_id"), false);
  });

  it("087 forward → rollback → forward restores composites and legacy FKs cycle", async () => {
    const pool = getPool();

    // Start from contracted members so 087 rollback can drop company_id cleanly.
    if (!(await fkExists("FK_work_team_members_employee_company"))) {
      await applySqlScriptInTransaction(pool, readMigration("088_phase1_work_team_members_contract.sql"));
    }

    assert.equal(await fkExists("FK_attendance_records_employee_company"), true);

    // Contract first (088), then expand rollback (087).
    await applySqlScriptInTransaction(pool, readRollback("088_phase1_work_team_members_contract_rollback.sql"));
    await applySqlScriptInTransaction(pool, readRollback("087_phase1_tenant_composite_fks_rollback.sql"));

    assert.equal(await fkExists("FK_attendance_records_employee_company"), false);
    assert.equal(await fkExists("FK_attendance_records_employee_id"), true);
    assert.equal(await fkExists("FK_operation_assignments_employee_company"), false);
    assert.equal(await columnNullable("dbo.work_team_members", "company_id"), null);

    await applySqlScriptInTransaction(pool, readMigration("087_phase1_tenant_composite_fks.sql"));
    assert.equal(await fkExists("FK_attendance_records_employee_company"), true);
    assert.equal(await fkExists("FK_attendance_records_employee_id"), false);
    assert.equal(await columnNullable("dbo.work_team_members", "company_id"), true);

    await applySqlScriptInTransaction(pool, readMigration("088_phase1_work_team_members_contract.sql"));
    assert.equal(await fkExists("FK_work_team_members_employee_company"), true);
    assert.equal(await columnNullable("dbo.work_team_members", "company_id"), false);
  });

  it("documents that runner strips USE and keeps transactional batch count for 087", () => {
    const script = readMigration("087_phase1_tenant_composite_fks.sql");
    const batches = splitBatches(script).map(stripLegacyDatabaseUse).filter(Boolean);
    assert.ok(batches.length > 10, "087 should still be multi-batch");
    assert.ok(
      batches.every((batch) => !/^\s*USE\s+/im.test(batch)),
      "USE statements must be stripped before execution",
    );
  });
});
