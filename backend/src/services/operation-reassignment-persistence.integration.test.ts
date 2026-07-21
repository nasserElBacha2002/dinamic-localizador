import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { operationAssignmentService } from "./operation-assignment.service";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

interface ExpectationRow {
  id: string;
  expectation_status: string;
  cancellation_reason: string | null;
  operation_assignment_id: string | null;
}

async function loadActiveExpectation(
  companyId: string,
  operationId: string,
  employeeId: string,
): Promise<ExpectationRow | null> {
  const pool = getPool();
  const result = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("operationId", sql.UniqueIdentifier, operationId)
    .input("employeeId", sql.UniqueIdentifier, employeeId)
    .query(`
      SELECT ew.id, ew.expectation_status, ew.cancellation_reason, ew.operation_assignment_id
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
      WHERE ew.company_id = @companyId
        AND ow.operation_id = @operationId
        AND ew.employee_id = @employeeId
        AND ew.expectation_status <> 'CANCELLED'
    `);
  return (result.recordset[0] as ExpectationRow | undefined) ?? null;
}

describeDatabaseIntegration("operation reassignment persistence integration", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  const createOneTimeOperationWithEmployee = async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const serviceResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(serviceResult.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const futureStart = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, futureStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED', 'ONE_TIME')
      `);
    const operationId = String(operationInsert.recordset[0].id);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(1))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Reassign Persistence', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);

    return { companyId, operationId, employeeId };
  };

  it("relinks employee_workday to a new assignment after cancellation (ONE_TIME)", async () => {
    const { companyId, operationId, employeeId } = await createOneTimeOperationWithEmployee();

    const assignmentA = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      employeeId,
    );

    const afterAssign = await loadActiveExpectation(companyId, operationId, employeeId);
    assert.ok(afterAssign);
    assert.equal(afterAssign.expectation_status, "EXPECTED");
    assert.equal(afterAssign.cancellation_reason, null);
    assert.equal(afterAssign.operation_assignment_id, assignmentA.id);

    await operationAssignmentService.cancelAssignment(companyId, operationId, assignmentA.id);

    const pool = getPool();
    const cancelledAssignment = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentA.id)
      .query(`
        SELECT cancelled_at FROM operation_assignments
        WHERE company_id = @companyId AND id = @assignmentId
      `);
    assert.ok(cancelledAssignment.recordset[0].cancelled_at);

    const cancelledExpectation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentA.id)
      .query(`
        SELECT expectation_status, cancellation_reason FROM employee_workdays
        WHERE company_id = @companyId AND operation_assignment_id = @assignmentId
      `);
    assert.equal(cancelledExpectation.recordset[0].expectation_status, "CANCELLED");
    assert.equal(cancelledExpectation.recordset[0].cancellation_reason, "ASSIGNMENT");

    const assignmentB = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      employeeId,
    );
    assert.notEqual(assignmentB.id, assignmentA.id);

    const afterReassign = await loadActiveExpectation(companyId, operationId, employeeId);
    assert.ok(afterReassign);
    assert.equal(afterReassign.expectation_status, "EXPECTED");
    assert.equal(afterReassign.cancellation_reason, null);
    assert.equal(afterReassign.operation_assignment_id, assignmentB.id);

    // The historical assignment must stay cancelled, never reactivated.
    const historical = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentA.id)
      .query(`
        SELECT cancelled_at FROM operation_assignments
        WHERE company_id = @companyId AND id = @assignmentId
      `);
    assert.ok(historical.recordset[0].cancelled_at);
  });

  it("rejects cancellation when the assignment already has attendance", async () => {
    const { companyId, operationId, employeeId } = await createOneTimeOperationWithEmployee();

    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      employeeId,
    );

    const expectation = await loadActiveExpectation(companyId, operationId, employeeId);
    assert.ok(expectation);

    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, expectation.id)
      .query(`
        INSERT INTO attendance_records (
          company_id, operation_id, employee_id, employee_workday_id,
          received_latitude, received_longitude,
          distance_meters, validation_status, location_status, punctuality_status,
          received_at, is_simulation
        )
        VALUES (
          @companyId, @operationId, @employeeId, @employeeWorkdayId,
          -34.6, -58.4, 10, 'VALID', 'INSIDE_GEOFENCE', 'ON_TIME',
          SYSUTCDATETIME(), 0
        )
      `);

    await assert.rejects(
      () => operationAssignmentService.cancelAssignment(companyId, operationId, assignment.id),
      (error: unknown) =>
        error instanceof AppError && error.code === "ASSIGNMENT_HAS_ATTENDANCE_RECORDS",
    );

    // The assignment and its expectation must remain untouched.
    const stillActive = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignment.id)
      .query(`
        SELECT cancelled_at FROM operation_assignments
        WHERE company_id = @companyId AND id = @assignmentId
      `);
    assert.equal(stillActive.recordset[0].cancelled_at, null);

    const expectationAfter = await loadActiveExpectation(companyId, operationId, employeeId);
    assert.ok(expectationAfter);
    assert.equal(expectationAfter.expectation_status, "EXPECTED");
  });
});

// Keep a plain describe marker so the file is recognized even when DB is disabled.
describe("operation reassignment persistence (guard)", () => {
  it("is gated behind RUN_DB_INTEGRATION_TESTS", () => {
    assert.ok(true);
  });
});
