import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { resolveWorkDateFromScheduledStart } from "../utils/work-date";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { toDateOnlyString } from "../utils/row-mappers";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeWorkdayAvailabilityService } from "./employee-workday-availability.service";
import { oneTimeScheduleRepairService } from "./one-time-operation-schedule-reconciliation.service";
import { workdayMaterializationService } from "./workday-materialization.service";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("ONE_TIME schedule reconciliation integration", () => {
  const fixtures = createIntegrationFixtureTracker();

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("reproduces date A→B edit and keeps workdays/assignments/check-in coherent", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);

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

    const dateAStart = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    dateAStart.setUTCHours(23, 30, 0, 0);
    const dateAEnd = new Date(dateAStart.getTime() + 6.5 * 60 * 60 * 1000);
    const dateBStart = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    dateBStart.setUTCHours(23, 30, 0, 0);
    const dateBEnd = new Date(dateBStart.getTime() + 6.5 * 60 * 60 * 1000);

    const workDateA = resolveWorkDateFromScheduledStart(dateAStart, timezone);
    const workDateB = resolveWorkDateFromScheduledStart(dateBStart, timezone);
    assert.notEqual(workDateA, workDateB);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, dateAStart)
      .input("scheduledEnd", sql.DateTime2, dateAEnd)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, 90, 'SCHEDULED'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const employees = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone1", sql.NVarChar(20), uniquePhone(1))
      .input("phone2", sql.NVarChar(20), uniquePhone(2))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES
          (@companyId, N'OW Reconcile A', @phone1, 'fijo', 1),
          (@companyId, N'OW Reconcile B', @phone2, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeIds = employees.recordset.map((row) => String((row as { id: string }).id));
    for (const employeeId of employeeIds) {
      fixtures.trackEmployee(companyId, employeeId);
    }

    for (const employeeId of employeeIds) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .input("workDate", sql.Date, workDateA)
        .query(`
          INSERT INTO operation_assignments (
            id, company_id, operation_id, employee_id, valid_from, valid_until,
            confirmation_status, confirmation_schedule_version
          )
          VALUES (
            NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate,
            'PENDING', 1
          )
        `);
    }

    await workdayMaterializationService.ensureOneTimeOperationMaterialized(companyId, operationId);
    for (const employeeId of employeeIds) {
      await workdayMaterializationService.ensureEmployeeWorkday(
        companyId,
        operationId,
        employeeId,
      );
    }

    const beforeWorkdays = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT id, work_date, expected_start_at, expected_end_at, schedule_version
        FROM operation_workdays
        WHERE company_id = @companyId AND operation_id = @operationId
      `);
    assert.equal(beforeWorkdays.recordset.length, 1);
    const beforeWorkdayId = String(beforeWorkdays.recordset[0].id);
    assert.equal(
      toDateOnlyString(beforeWorkdays.recordset[0].work_date as Date | string),
      workDateA,
    );

    const { operationService } = await import("./operation.service");
    await operationService.update(companyId, operationId, {
      scheduledStart: dateBStart.toISOString(),
      scheduledEnd: dateBEnd.toISOString(),
    });

    const operationRow = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT scheduled_start, scheduled_end
        FROM scheduled_operations
        WHERE company_id = @companyId AND id = @operationId
      `);
    assert.equal(
      new Date(operationRow.recordset[0].scheduled_start).toISOString(),
      dateBStart.toISOString(),
    );
    assert.equal(
      new Date(operationRow.recordset[0].scheduled_end).toISOString(),
      dateBEnd.toISOString(),
    );

    const afterWorkdays = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT id, work_date, expected_start_at, expected_end_at, schedule_version
        FROM operation_workdays
        WHERE company_id = @companyId AND operation_id = @operationId
      `);
    assert.equal(afterWorkdays.recordset.length, 1);
    assert.equal(String(afterWorkdays.recordset[0].id), beforeWorkdayId);
    assert.equal(
      toDateOnlyString(afterWorkdays.recordset[0].work_date as Date | string),
      workDateB,
    );
    assert.equal(
      new Date(afterWorkdays.recordset[0].expected_start_at).toISOString(),
      dateBStart.toISOString(),
    );
    assert.equal(
      new Date(afterWorkdays.recordset[0].expected_end_at).toISOString(),
      dateBEnd.toISOString(),
    );
    assert.ok(Number(afterWorkdays.recordset[0].schedule_version) >= 2);

    const assignments = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT valid_from, valid_until, confirmation_schedule_version
        FROM operation_assignments
        WHERE company_id = @companyId AND operation_id = @operationId AND cancelled_at IS NULL
      `);
    assert.equal(assignments.recordset.length, 2);
    for (const row of assignments.recordset) {
      assert.equal(toDateOnlyString(row.valid_from as Date | string), workDateB);
      assert.equal(toDateOnlyString(row.valid_until as Date | string), workDateB);
      assert.equal(Number(row.confirmation_schedule_version), 2);
    }

    const employeeWorkdays = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, beforeWorkdayId)
      .query(`
        SELECT employee_id, expectation_status
        FROM employee_workdays
        WHERE company_id = @companyId AND operation_workday_id = @operationWorkdayId
      `);
    assert.equal(employeeWorkdays.recordset.length, 2);
    for (const row of employeeWorkdays.recordset) {
      assert.equal(String(row.expectation_status), "EXPECTED");
    }

    const checkInAt = new Date(dateBStart.getTime() + 5 * 60 * 1000);
    for (const employeeId of employeeIds) {
      const available = await employeeWorkdayAvailabilityService.listAvailableForCheckIn(
        companyId,
        employeeId,
        checkInAt,
      );
      assert.equal(available.candidates.length, 1);
      assert.equal(available.candidates[0]?.operationId, operationId);
      assert.equal(available.candidates[0]?.workDate, workDateB);
      assert.equal(available.candidates[0]?.operationWorkdayId, beforeWorkdayId);
    }

    const staleAt = new Date(dateAStart.getTime() + 5 * 60 * 1000);
    const stale = await employeeWorkdayAvailabilityService.listAvailableForCheckIn(
      companyId,
      employeeIds[0]!,
      staleAt,
    );
    assert.equal(
      stale.candidates.filter((candidate) => candidate.operationId === operationId).length,
      0,
    );

    // Idempotent re-apply of the same schedule
    await operationService.update(companyId, operationId, {
      scheduledStart: dateBStart.toISOString(),
      scheduledEnd: dateBEnd.toISOString(),
    });
    const workdayCount = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT COUNT(*) AS total
        FROM operation_workdays
        WHERE company_id = @companyId AND operation_id = @operationId
      `);
    assert.equal(Number(workdayCount.recordset[0].total), 1);

    const dryRun = await oneTimeScheduleRepairService.repairFromCurrentSchedule(
      companyId,
      operationId,
      { apply: false },
    );
    assert.equal(dryRun.status, "consistent");
  });

  it("blocks schedule move when attendance already exists on the workday", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);

    const serviceResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id, latitude, longitude, allowed_radius_meters
        FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(serviceResult.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const start = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);
    start.setUTCHours(23, 30, 0, 0);
    const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
    const workDate = resolveWorkDateFromScheduledStart(start, timezone);
    const movedStart = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    movedStart.setUTCHours(23, 30, 0, 0);
    const movedEnd = new Date(movedStart.getTime() + 6 * 60 * 60 * 1000);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, 90, 'SCHEDULED'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneNumber", sql.NVarChar(20), uniquePhone(3))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'OW Locked Attendance', @phoneNumber, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate)
      `);

    const employeeWorkday = await workdayMaterializationService.ensureEmployeeWorkday(
      companyId,
      operationId,
      employeeId,
    );

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkday.id)
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

    const { operationService } = await import("./operation.service");
    await assert.rejects(
      () =>
        operationService.update(companyId, operationId, {
          scheduledStart: movedStart.toISOString(),
          scheduledEnd: movedEnd.toISOString(),
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_SCHEDULE_LOCKED_BY_ATTENDANCE",
    );

    const operationRow = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT scheduled_start FROM scheduled_operations
        WHERE company_id = @companyId AND id = @operationId
      `);
    assert.equal(
      new Date(operationRow.recordset[0].scheduled_start).toISOString(),
      start.toISOString(),
    );
  });
});
