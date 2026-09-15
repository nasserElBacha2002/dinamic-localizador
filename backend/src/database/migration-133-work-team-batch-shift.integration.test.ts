/**
 * Migration 133 — work_team_assignment_batches.operation_shift_id.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 *
 * Shared DB may already have 133 applied. Always restore forward shape in after().
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
import { getPool } from "./connection";
import { applySqlScriptInTransaction, stripLegacyDatabaseUse } from "./run-migrations";

const ROOT = join(process.cwd(), "..");
const MIGRATION_133 = join(
  ROOT,
  "database/migrations/133_work_team_assignment_batch_operation_shift.sql",
);
const ROLLBACK_133 = join(
  ROOT,
  "database/migrations/rollback/133_work_team_assignment_batch_operation_shift_rollback.sql",
);

/** Strip legacy USE; runner already targets env.DB_NAME and owns the TDS transaction. */
const prepareScriptForRunner = (script: string): string =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map(stripLegacyDatabaseUse)
    .filter(Boolean)
    .join("\nGO\n");

const apply133Forward = async (): Promise<void> => {
  const pool = getPool();
  await applySqlScriptInTransaction(pool, prepareScriptForRunner(readFileSync(MIGRATION_133, "utf8")));
};

const apply133Rollback = async (): Promise<void> => {
  const pool = getPool();
  await applySqlScriptInTransaction(pool, prepareScriptForRunner(readFileSync(ROLLBACK_133, "utf8")));
};

describeDatabaseIntegration("migration 133 work_team_assignment_batch operation_shift", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    try {
      await apply133Forward();
    } catch (error) {
      console.warn("[migration-133] restore forward failed", error);
    }
    await teardownDatabaseIntegration();
  });

  it("applies column + tenant FK + filtered index; rollback removes them", async () => {
    const pool = getPool();

    await apply133Forward();

    const col = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.work_team_assignment_batches', N'operation_shift_id') AS col_len
    `);
    assert.ok(Number(col.recordset[0]?.col_len) > 0);

    const fk = await pool
      .request()
      .input("name", sql.NVarChar(256), "FK_work_team_assignment_batches_shift_tenant")
      .query(`
        SELECT COUNT(*) AS cnt
        FROM sys.foreign_keys
        WHERE name = @name
          AND parent_object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
      `);
    assert.equal(Number(fk.recordset[0]?.cnt), 1);

    const idx = await pool
      .request()
      .input("name", sql.NVarChar(256), "IX_work_team_assignment_batches_operation_shift")
      .query(`
        SELECT COUNT(*) AS cnt
        FROM sys.indexes
        WHERE name = @name
          AND object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
      `);
    assert.equal(Number(idx.recordset[0]?.cnt), 1);

    // Idempotent re-apply
    await apply133Forward();

    await apply133Rollback();

    const colAfter = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.work_team_assignment_batches', N'operation_shift_id') AS col_len
    `);
    assert.equal(colAfter.recordset[0]?.col_len, null);

    const fkAfter = await pool
      .request()
      .input("name", sql.NVarChar(256), "FK_work_team_assignment_batches_shift_tenant")
      .query(`
        SELECT COUNT(*) AS cnt
        FROM sys.foreign_keys
        WHERE name = @name
          AND parent_object_id = OBJECT_ID(N'dbo.work_team_assignment_batches')
      `);
    assert.equal(Number(fkAfter.recordset[0]?.cnt), 0);
  });
});
