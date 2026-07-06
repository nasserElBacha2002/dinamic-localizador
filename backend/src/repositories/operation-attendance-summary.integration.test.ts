import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { operationAttendanceRepository } from "../repositories/operation-attendance.repository";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("inventory attendance confirmation summary integration", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("maps confirmation summary counts and row-level statuses", async () => {
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
    const serviceId = String(storeResult.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const futureStart = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();
    const inventoryInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, new Date(futureStart))
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED')
      `);
    const operationId = String(inventoryInsert.recordset[0].id);

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
          (@companyId, N'Emp Pending', @phone1, 'fijo', 1),
          (@companyId, N'Emp Confirmed', @phone2, 'fijo', 1),
          (@companyId, N'Emp Unavailable', @phone3, 'fijo', 1)
      `);

    const [pendingId, confirmedId, unavailableId] = employees.recordset.map((row) =>
      String((row as { id: string }).id),
    );

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("pendingId", sql.UniqueIdentifier, pendingId)
      .input("confirmedId", sql.UniqueIdentifier, confirmedId)
      .input("unavailableId", sql.UniqueIdentifier, unavailableId)
      .query(`
        INSERT INTO operation_assignments (
          company_id, operation_id, employee_id, confirmation_status, confirmed_at, unavailable_at
        )
        VALUES
          (@companyId, @operationId, @pendingId, 'PENDING', NULL, NULL),
          (@companyId, @operationId, @confirmedId, 'CONFIRMED', SYSUTCDATETIME(), NULL),
          (@companyId, @operationId, @unavailableId, 'UNAVAILABLE', NULL, SYSUTCDATETIME())
      `);

    const summary = await operationAttendanceRepository.getAttendanceSummary(
      companyId,
      operationId,
      1,
      10,
    );

    assert.ok(summary);
    assert.equal(summary.summary.assigned, 3);
    assert.equal(summary.summary.confirmedEmployees, 1);
    assert.equal(summary.summary.pendingConfirmationEmployees, 1);
    assert.equal(summary.summary.unavailableEmployees, 1);

    const byEmployeeId = new Map(summary.employees.map((row) => [row.employee.id, row]));
    assert.equal(byEmployeeId.get(pendingId)?.confirmationStatus, "PENDING");
    assert.equal(byEmployeeId.get(confirmedId)?.confirmationStatus, "CONFIRMED");
    assert.equal(byEmployeeId.get(unavailableId)?.confirmationStatus, "UNAVAILABLE");
    assert.ok(byEmployeeId.get(confirmedId)?.confirmedAt);
    assert.ok(byEmployeeId.get(unavailableId)?.unavailableAt);
  });
});
