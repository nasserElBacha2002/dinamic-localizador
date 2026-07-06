import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { getPool } from "./connection";
import { operationRepository } from "../repositories/operation.repository";
import { lookupRepository } from "../repositories/lookup.repository";
import { serviceRepository } from "../repositories/service.repository";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

const objectId = async (name: string, type: "U" | "V"): Promise<number | null> => {
  const pool = getPool();
  const result = await pool
    .request()
    .input("name", sql.NVarChar(256), name)
    .input("type", sql.NVarChar(2), type)
    .query("SELECT OBJECT_ID(@name, @type) AS objectId");

  const value = result.recordset[0]?.objectId;
  return value === null || value === undefined ? null : Number(value);
};

const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
  const pool = getPool();
  const result = await pool
    .request()
    .input("tableName", sql.NVarChar(128), tableName)
    .input("columnName", sql.NVarChar(128), columnName)
    .query(`
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
        AND COLUMN_NAME = @columnName
    `);

  return Boolean(result.recordset[0]);
};

describeDatabaseIntegration("operational table rename schema (Phase 2.7)", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("has physical operational tables after migration 021", async () => {
    assert.ok(await objectId("dbo.operational_locations", "U"));
    assert.ok(await objectId("dbo.scheduled_operations", "U"));
    assert.ok(await objectId("dbo.operation_assignments", "U"));
  });

  it("does not expose legacy compatibility views after migration 037", async () => {
    assert.equal(await objectId("dbo.stores", "V"), null);
    assert.equal(await objectId("dbo.inventories", "V"), null);
    assert.equal(await objectId("dbo.inventory_employees", "V"), null);
  });

  it("keeps employees and attendance_records as physical tables", async () => {
    assert.ok(await objectId("dbo.employees", "U"));
    assert.ok(await objectId("dbo.attendance_records", "U"));
  });

  it("keeps renamed column names on physical tables (migration 035)", async () => {
    assert.ok(await columnExists("scheduled_operations", "service_id"));
    assert.ok(await columnExists("operation_assignments", "operation_id"));
    assert.ok(await columnExists("operation_assignments", "employee_id"));
    assert.ok(await columnExists("attendance_records", "operation_id"));
    assert.ok(await columnExists("attendance_records", "employee_id"));
  });

  it("repository list methods work against physical tables", async () => {
    const companyId = await requireDinamicCompanyId();

    const services = await serviceRepository.list(companyId, { page: 1, limit: 5 });
    assert.ok(Array.isArray(services.items));

    const operations = await operationRepository.list(companyId, { page: 1, limit: 5 });
    assert.ok(Array.isArray(operations.items));

    const serviceLookups = await lookupRepository.listServices(companyId, { limit: 5 });
    assert.ok(Array.isArray(serviceLookups));

    const operationLookups = await lookupRepository.listOperations(companyId, { limit: 5 });
    assert.ok(Array.isArray(operationLookups));
  });
});
