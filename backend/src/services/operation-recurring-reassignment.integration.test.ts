import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { WEEKDAYS } from "../constants/weekday";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { operationAttendanceRepository } from "../repositories/operation-attendance.repository";
import { operationAssignmentService } from "../services/operation-assignment.service";
import { operationService } from "../services/operation.service";
import { recurringWorkdayMaterializationService } from "../services/recurring-workday-materialization.service";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

const allDaysSchedule = WEEKDAYS.map((dayOfWeek) => ({
  dayOfWeek,
  isEnabled: true,
  startTime: "09:00",
  endTime: "18:00",
}));

interface ExpectationRow {
  id: string;
  work_date: string;
  expectation_status: string;
  cancellation_reason: string | null;
  operation_assignment_id: string | null;
  cancelled_at: string | null;
}

async function loadExpectationsForEmployee(
  companyId: string,
  operationId: string,
  employeeId: string,
): Promise<ExpectationRow[]> {
  const pool = getPool();
  const result = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("operationId", sql.UniqueIdentifier, operationId)
    .input("employeeId", sql.UniqueIdentifier, employeeId)
    .query(`
      SELECT
        ew.id,
        CAST(ow.work_date AS DATE) AS work_date,
        ew.expectation_status,
        ew.cancellation_reason,
        ew.operation_assignment_id,
        oa.cancelled_at
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
      LEFT JOIN operation_assignments oa ON oa.id = ew.operation_assignment_id
      WHERE ew.company_id = @companyId
        AND ow.operation_id = @operationId
        AND ew.employee_id = @employeeId
      ORDER BY ow.work_date ASC
    `);

  return result.recordset as ExpectationRow[];
}

describeDatabaseIntegration("recurring reassignment persistence integration", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("reactivates employee_workdays when the same employee is reassigned after cancellation", async () => {
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

    const operation = await operationService.createRecurring(
      companyId,
      {
        operationKind: "RECURRING",
        serviceId,
        validFrom: "2026-07-13",
        scheduleSource: "CUSTOM",
        scheduleDays: allDaysSchedule,
      },
      { earlyToleranceMinutes: 60, lateToleranceMinutes: 90 },
    );

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(21))
      .query(`
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id
        VALUES (@companyId, N'Recurring Reassign', @phone, 'fijo', 1)
      `);
    const employeeId = String(employeeInsert.recordset[0].id);

    const assignmentA = await operationAssignmentService.assignEmployee(
      companyId,
      operation.id,
      employeeId,
      { validFrom: "2026-07-13" },
    );

    const afterAssign = await loadExpectationsForEmployee(companyId, operation.id, employeeId);
    const todayExpectation = afterAssign.find((row) => String(row.work_date).slice(0, 10) === "2026-07-13");
    assert.ok(todayExpectation);
    assert.equal(todayExpectation.expectation_status, "EXPECTED");
    assert.equal(todayExpectation.operation_assignment_id, assignmentA.id);

    await operationAssignmentService.cancelAssignment(companyId, operation.id, assignmentA.id);

    const afterCancel = await loadExpectationsForEmployee(companyId, operation.id, employeeId);
    const cancelledToday = afterCancel.find((row) => String(row.work_date).slice(0, 10) === "2026-07-13");
    assert.ok(cancelledToday);
    assert.equal(cancelledToday.expectation_status, "CANCELLED");
    assert.equal(cancelledToday.cancellation_reason, "ASSIGNMENT");

    const assignmentB = await operationAssignmentService.assignEmployee(
      companyId,
      operation.id,
      employeeId,
      { validFrom: "2026-07-13" },
    );
    assert.notEqual(assignmentB.id, assignmentA.id);

    await recurringWorkdayMaterializationService.materializeOperationHorizon(companyId, operation.id);

    const afterReassign = await loadExpectationsForEmployee(companyId, operation.id, employeeId);
    const reactivatedToday = afterReassign.find(
      (row) => String(row.work_date).slice(0, 10) === "2026-07-13",
    );
    assert.ok(reactivatedToday);
    assert.equal(reactivatedToday.expectation_status, "EXPECTED");
    assert.equal(reactivatedToday.cancellation_reason, null);
    assert.equal(reactivatedToday.operation_assignment_id, assignmentB.id);

    const summary = await operationAttendanceRepository.getAttendanceSummary(
      companyId,
      operation.id,
      1,
      10,
      undefined,
      "2026-07-13",
    );
    assert.ok(summary);
    assert.equal(summary.summary.assigned, 1);
    assert.equal(summary.employees[0]?.employee.id, employeeId);
    assert.equal(summary.employees[0]?.assignmentId, assignmentB.id);

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
});
