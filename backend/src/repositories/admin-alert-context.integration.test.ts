/**
 * SQL Server integration: admin-alert context queries must resolve against real schema.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 *
 * Regression: Invalid object name 'services' — service_id FK points to operational_locations.
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { adminAlertContextRepository } from "../repositories/admin-alert-context.repository";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describeDatabaseIntegration("admin alert context operational_locations joins", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("FK scheduled_operations.service_id references operational_locations", async () => {
    const result = await getPool().request().query(`
      SELECT
        OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      WHERE fk.parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
        AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = N'service_id'
      ORDER BY referenced_table, referenced_column
    `);

    const tables = new Set(result.recordset.map((row) => String(row.referenced_table)));
    assert.ok(tables.has("operational_locations"));
    assert.equal(tables.has("services"), false);

    const columns = result.recordset.map((row) => String(row.referenced_column));
    assert.ok(columns.includes("id"));
  });

  it("operational_locations exposes name/address/locality used by admin alerts", async () => {
    const result = await getPool().request().query(`
      SELECT name
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.operational_locations')
        AND name IN (N'id', N'company_id', N'name', N'address', N'locality')
    `);
    const names = new Set(result.recordset.map((row) => String(row.name)));
    for (const required of ["id", "company_id", "name", "address", "locality"]) {
      assert.ok(names.has(required), `missing column operational_locations.${required}`);
    }
  });

  it("listMissing* queries execute without Invalid object name errors", async () => {
    const emptyGuid = "00000000-0000-4000-8000-000000000000";

    await assert.doesNotReject(() =>
      adminAlertContextRepository.listMissingCheckinCandidatesForOperation(
        emptyGuid,
        emptyGuid,
      ),
    );
    await assert.doesNotReject(() =>
      adminAlertContextRepository.listMissingUnavailableObligations(1),
    );
    await assert.doesNotReject(() =>
      adminAlertContextRepository.listMissingPendingAbsenceObligations(1),
    );
    await assert.doesNotReject(() =>
      adminAlertContextRepository.listMissingMissingCheckinObligations(1),
    );
  });

  it("services object does not exist in dbo schema", async () => {
    const result = await getPool()
      .request()
      .input("name", sql.NVarChar(128), "services")
      .query(`
        SELECT OBJECT_ID(N'dbo.' + @name) AS object_id
      `);
    assert.equal(result.recordset[0]?.object_id, null);
  });
});
