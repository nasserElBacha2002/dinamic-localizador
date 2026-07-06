import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("inventory schedule confirmation reset integration", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    mock.restoreAll();
    await teardownDatabaseIntegration();
  });

  it("resets all confirmation states when scheduled_start changes materially", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const storeResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const storeId = String(storeResult.recordset[0]?.id ?? "");
    assert.ok(storeId);

    const futureStart = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const rescheduledStart = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);

    const inventoryInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("storeId", sql.UniqueIdentifier, storeId)
      .input("scheduledStart", sql.DateTime2, futureStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, store_id, scheduled_start, early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id, INSERTED.scheduled_start
        VALUES (@companyId, @storeId, @scheduledStart, 60, 90, 'SCHEDULED')
      `);
    const inventoryId = String(inventoryInsert.recordset[0].id);

    const employees = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone1", sql.NVarChar(20), uniquePhone(1))
      .input("phone2", sql.NVarChar(20), uniquePhone(2))
      .input("phone3", sql.NVarChar(20), uniquePhone(3))
      .query(`
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id
        VALUES
          (@companyId, N'Confirmed Reset', @phone1, 'fijo', 1),
          (@companyId, N'Unavailable Reset', @phone2, 'fijo', 1),
          (@companyId, N'Pending Reset', @phone3, 'fijo', 1)
      `);

    const [confirmedId, unavailableId, pendingId] = employees.recordset.map((row) =>
      String((row as { id: string }).id),
    );

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("confirmedId", sql.UniqueIdentifier, confirmedId)
      .input("unavailableId", sql.UniqueIdentifier, unavailableId)
      .input("pendingId", sql.UniqueIdentifier, pendingId)
      .query(`
        INSERT INTO operation_assignments (
          company_id, inventory_id, employee_id, confirmation_status,
          confirmed_at, unavailable_at, confirmation_schedule_version
        )
        VALUES
          (@companyId, @inventoryId, @confirmedId, 'CONFIRMED', SYSUTCDATETIME(), NULL, 1),
          (@companyId, @inventoryId, @unavailableId, 'UNAVAILABLE', NULL, SYSUTCDATETIME(), 1),
          (@companyId, @inventoryId, @pendingId, 'PENDING', NULL, NULL, 1)
      `);

    const { inventoryService } = await import("./inventory.service");
    await inventoryService.update(companyId, inventoryId, {
      scheduledStart: rescheduledStart.toISOString(),
    });

    const assignmentResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .query(`
        SELECT confirmation_status, confirmed_at, unavailable_at, confirmation_schedule_version
        FROM operation_assignments
        WHERE company_id = @companyId
          AND inventory_id = @inventoryId
        ORDER BY confirmation_status
      `);

    assert.equal(assignmentResult.recordset.length, 3);
    for (const row of assignmentResult.recordset as Array<{
      confirmation_status: string;
      confirmed_at: Date | null;
      unavailable_at: Date | null;
      confirmation_schedule_version: number;
    }>) {
      assert.equal(row.confirmation_status, "PENDING");
      assert.equal(row.confirmed_at, null);
      assert.equal(row.unavailable_at, null);
      assert.equal(row.confirmation_schedule_version, 2);
    }
  });

  it("rolls back inventory schedule and assignment confirmations when reset fails", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const storeResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const storeId = String(storeResult.recordset[0]?.id ?? "");
    assert.ok(storeId);

    const oldStart = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
    const newStart = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000);

    const inventoryInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("storeId", sql.UniqueIdentifier, storeId)
      .input("scheduledStart", sql.DateTime2, oldStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, store_id, scheduled_start, early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @storeId, @scheduledStart, 60, 90, 'SCHEDULED')
      `);
    const inventoryId = String(inventoryInsert.recordset[0].id);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneNumber", sql.NVarChar(20), uniquePhone(9))
      .query(`
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id
        VALUES (@companyId, N'Rollback Integration', @phoneNumber, 'fijo', 1)
      `);
    const employeeId = String(employeeInsert.recordset[0].id);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO operation_assignments (
          company_id, inventory_id, employee_id, confirmation_status, confirmed_at, confirmation_schedule_version
        )
        VALUES (@companyId, @inventoryId, @employeeId, 'CONFIRMED', SYSUTCDATETIME(), 1)
      `);

    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { auditService } = await import("./audit.service");

    mock.method(
      employeeAssignmentQueryRepository,
      "resetConfirmationsForInventoryScheduleChange",
      async () => {
        throw new Error("forced reset failure");
      },
    );
    const auditMock = mock.method(auditService, "log", async () => undefined);

    const { inventoryService } = await import("./inventory.service");

    await assert.rejects(
      () =>
        inventoryService.update(companyId, inventoryId, {
          scheduledStart: newStart.toISOString(),
        }),
      /forced reset failure/,
    );

    const inventoryRow = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .query(`
        SELECT scheduled_start
        FROM scheduled_operations
        WHERE company_id = @companyId AND id = @inventoryId
      `);
    const persistedStart = new Date(
      (inventoryRow.recordset[0] as { scheduled_start: Date }).scheduled_start,
    );
    assert.equal(persistedStart.toISOString(), oldStart.toISOString());

    const assignmentRow = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT confirmation_status, confirmed_at, confirmation_schedule_version
        FROM operation_assignments
        WHERE company_id = @companyId
          AND inventory_id = @inventoryId
          AND employee_id = @employeeId
      `);
    const assignment = assignmentRow.recordset[0] as {
      confirmation_status: string;
      confirmed_at: Date | null;
      confirmation_schedule_version: number;
    };
    assert.equal(assignment.confirmation_status, "CONFIRMED");
    assert.ok(assignment.confirmed_at);
    assert.equal(assignment.confirmation_schedule_version, 1);
    assert.equal(auditMock.mock.callCount(), 0);
  });
});
