import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { operationService } from "./operation.service";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("ONE_TIME tolerance-only reminder version stability", () => {
  const fixtures = createIntegrationFixtureTracker();

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("does not reopen SENT arrival reminders when only tolerances change", async () => {
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

    const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    start.setUTCHours(23, 30, 0, 0);
    const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);

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
      .input("phoneNumber", sql.NVarChar(20), uniquePhone(7))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Tolerance Reminder', @phoneNumber, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, start.toISOString().slice(0, 10))
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate)
      `);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        VALUES (
          @companyId, @operationId, CAST(@scheduledStart AS DATE),
          @scheduledStart, @scheduledEnd, 60, 90, 1, 'ACTIVE'
        )
      `);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO whatsapp_attendance_notifications (
          company_id, operation_id, employee_id, notification_type, status,
          attempt_count, schedule_version, reminder_source, sent_at
        )
        VALUES (
          @companyId, @operationId, @employeeId, 'ARRIVAL_REMINDER_15_MIN', 'SENT',
          1, 1, 'AUTOMATIC', SYSUTCDATETIME()
        )
      `);

    await operationService.update(companyId, operationId, {
      earlyToleranceMinutes: 45,
      lateToleranceMinutes: 120,
    });

    const workday = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT early_tolerance_minutes, late_tolerance_minutes, schedule_version
        FROM operation_workdays
        WHERE company_id = @companyId AND operation_id = @operationId
      `);
    assert.equal(Number(workday.recordset[0].early_tolerance_minutes), 45);
    assert.equal(Number(workday.recordset[0].late_tolerance_minutes), 120);
    assert.equal(Number(workday.recordset[0].schedule_version), 1);

    const notifications = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT status, schedule_version
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND notification_type = 'ARRIVAL_REMINDER_15_MIN'
      `);
    assert.equal(notifications.recordset.length, 1);
    assert.equal(String(notifications.recordset[0].status), "SENT");
    assert.equal(Number(notifications.recordset[0].schedule_version), 1);

    const candidates = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("windowStart", sql.DateTime2, new Date(start.getTime() - 60_000))
      .input("windowEnd", sql.DateTime2, new Date(start.getTime() + 60_000))
      .input("staleBefore", sql.DateTime2, new Date(0))
      .input("maxAttempts", sql.Int, 3)
      .query(`
        SELECT COUNT(*) AS total
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.operation_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        INNER JOIN operation_workdays ow
          ON ow.operation_id = i.id AND ow.company_id = @companyId AND ow.status = 'ACTIVE'
         AND ow.expected_start_at = i.scheduled_start
        INNER JOIN employee_workdays ew
          ON ew.operation_workday_id = ow.id AND ew.employee_id = e.id
         AND ew.expectation_status = 'EXPECTED'
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.operation_id = i.id
         AND wan.employee_id = e.id
         AND wan.notification_type = 'ARRIVAL_REMINDER_15_MIN'
         AND wan.schedule_version = ow.schedule_version
        WHERE i.id = @operationId
          AND i.company_id = @companyId
          AND (
            wan.id IS NULL
            OR (wan.status = 'FAILED' AND wan.attempt_count < @maxAttempts)
            OR (wan.status = 'PENDING' AND COALESCE(wan.last_attempt_at, wan.created_at) < @staleBefore)
          )
      `);

    // SENT with matching schedule_version must block rediscovery.
    assert.equal(Number(candidates.recordset[0].total), 0);
  });
});
