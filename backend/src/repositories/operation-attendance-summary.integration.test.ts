import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  resolveCompanyTodayIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { operationAttendanceRepository } from "../repositories/operation-attendance.repository";
import { operationAssignmentService } from "../services/operation-assignment.service";
import { operationService } from "../services/operation.service";
import { recurringWorkdayMaterializationService } from "../services/recurring-workday-materialization.service";
import { WEEKDAYS } from "../constants/weekday";
import { addDaysToDateIso } from "../utils/recurring-workday-instant";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

const allDaysSchedule = WEEKDAYS.map((dayOfWeek) => ({
  dayOfWeek,
  isEnabled: true,
  startTime: "09:00",
  endTime: "18:00",
}));

describeDatabaseIntegration("operation attendance confirmation summary integration", () => {
  const fixtures = createIntegrationFixtureTracker();

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("maps confirmation summary counts and row-level statuses from employee_workdays", async () => {
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

    const futureStart = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();
    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, new Date(futureStart))
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes, late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED', 'ONE_TIME')
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const employees = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone1", sql.NVarChar(20), uniquePhone(1))
      .input("phone2", sql.NVarChar(20), uniquePhone(2))
      .input("phone3", sql.NVarChar(20), uniquePhone(3))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES
          (@companyId, N'Emp Pending', @phone1, 'fijo', 1),
          (@companyId, N'Emp Confirmed', @phone2, 'fijo', 1),
          (@companyId, N'Emp Unavailable', @phone3, 'fijo', 1);
        SELECT id FROM @inserted;
      `);

    const [pendingId, confirmedId, unavailableId] = employees.recordset.map((row) =>
      String((row as { id: string }).id),
    );
    fixtures.trackEmployee(companyId, pendingId);
    fixtures.trackEmployee(companyId, confirmedId);
    fixtures.trackEmployee(companyId, unavailableId);

    const assignmentPending = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      pendingId,
    );
    const assignmentConfirmed = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      confirmedId,
    );
    const assignmentUnavailable = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      unavailableId,
    );

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentConfirmed.id)
      .input("assignmentId2", sql.UniqueIdentifier, assignmentUnavailable.id)
      .query(`
        UPDATE operation_assignments
        SET confirmation_status = 'CONFIRMED', confirmed_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @assignmentId;

        UPDATE operation_assignments
        SET confirmation_status = 'UNAVAILABLE', unavailable_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @assignmentId2;
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

  it("returns workday-specific employee counts for recurring operations", async () => {
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

    const today = await resolveCompanyTodayIso(companyId);
    const laterDate = addDaysToDateIso(today, 7);

    const operation = await operationService.createRecurring(
      companyId,
      {
        operationKind: "RECURRING",
        serviceId,
        validFrom: today,
        scheduleSource: "CUSTOM",
        scheduleDays: allDaysSchedule,
      },
      { earlyToleranceMinutes: 60, lateToleranceMinutes: 90 },
    );
    fixtures.trackOperation(companyId, operation.id);

    const employees = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneA", sql.NVarChar(20), uniquePhone(10))
      .input("phoneB", sql.NVarChar(20), uniquePhone(11))
      .input("phoneC", sql.NVarChar(20), uniquePhone(12))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES
          (@companyId, N'Emp A', @phoneA, 'fijo', 1),
          (@companyId, N'Emp B', @phoneB, 'fijo', 1),
          (@companyId, N'Emp C', @phoneC, 'fijo', 1);
        SELECT id FROM @inserted;
      `);

    const [employeeA, employeeB, employeeC] = employees.recordset.map((row) =>
      String((row as { id: string }).id),
    );
    fixtures.trackEmployee(companyId, employeeA);
    fixtures.trackEmployee(companyId, employeeB);
    fixtures.trackEmployee(companyId, employeeC);

    await operationAssignmentService.assignEmployee(companyId, operation.id, employeeA, {
      validFrom: today,
    });
    await operationAssignmentService.assignEmployee(companyId, operation.id, employeeB, {
      validFrom: laterDate,
    });
    await operationAssignmentService.assignEmployee(companyId, operation.id, employeeC, {
      validFrom: laterDate,
    });

    await recurringWorkdayMaterializationService.materializeOperationHorizon(companyId, operation.id);

    const summaryStart = await operationAttendanceRepository.getAttendanceSummary(
      companyId,
      operation.id,
      1,
      10,
      undefined,
      today,
    );
    const summaryToday = await operationAttendanceRepository.getAttendanceSummary(
      companyId,
      operation.id,
      1,
      10,
      undefined,
      laterDate,
    );

    assert.ok(summaryStart);
    assert.ok(summaryToday);
    assert.equal(summaryStart.workDate, today);
    assert.equal(summaryToday.workDate, laterDate);
    assert.equal(summaryStart.summary.assigned, 1);
    assert.equal(summaryToday.summary.assigned, 3);
    assert.equal(summaryStart.employees.length, 1);
    assert.equal(summaryToday.employees.length, 3);
    assert.deepEqual(
      summaryStart.employees.map((row) => row.employee.id).sort(),
      [employeeA],
    );
    assert.deepEqual(
      summaryToday.employees.map((row) => row.employee.id).sort(),
      [employeeA, employeeB, employeeC].sort(),
    );
  });
});
