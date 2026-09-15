import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";

describeDatabaseIntegration("phase3 reminder idempotency by employee_workday (SQL)", () => {
  let companyId = "";
  let operationMorning = "";
  let operationAfternoon = "";
  let employeeId = "";
  let ewMorning = "";
  let ewAfternoon = "";

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    const col = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.whatsapp_attendance_notifications', N'employee_workday_id') AS len
    `);
    assert.ok(col.recordset[0]?.len != null, "migration 132 employee_workday_id required");

    const employee = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM dbo.employees WHERE company_id = @companyId AND active = 1
      `);
    employeeId = String(employee.recordset[0]?.id ?? "");
    assert.ok(employeeId);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM dbo.operational_locations WHERE company_id = @companyId AND active = 1
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const insertOp = async (): Promise<string> => {
      const operation = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("serviceId", sql.UniqueIdentifier, serviceId)
        .query(`
          INSERT INTO dbo.scheduled_operations (
            company_id, service_id, operation_kind, scheduled_start, scheduled_end,
            early_tolerance_minutes, late_tolerance_minutes,
            early_tolerance_source, late_tolerance_source, schedule_mode
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @serviceId, N'ONE_TIME',
            SYSUTCDATETIME(), DATEADD(HOUR, 8, SYSUTCDATETIME()),
            30, 30, N'CUSTOM', N'CUSTOM', N'SINGLE'
          );
        `);
      return String(operation.recordset[0].id);
    };

    operationMorning = await insertOp();
    operationAfternoon = await insertOp();
    ewMorning = randomUUID();
    ewAfternoon = randomUUID();
    const owMorning = randomUUID();
    const owAfternoon = randomUUID();

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationMorning", sql.UniqueIdentifier, operationMorning)
      .input("operationAfternoon", sql.UniqueIdentifier, operationAfternoon)
      .input("owMorning", sql.UniqueIdentifier, owMorning)
      .input("owAfternoon", sql.UniqueIdentifier, owAfternoon)
      .input("ewMorning", sql.UniqueIdentifier, ewMorning)
      .input("ewAfternoon", sql.UniqueIdentifier, ewAfternoon)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO dbo.operation_workdays (
          id, company_id, operation_id, work_date,
          expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes,
          schedule_version, schedule_source_snapshot, schedule_timezone_snapshot, status
        )
        VALUES
          (@owMorning, @companyId, @operationMorning, CAST(SYSUTCDATETIME() AS DATE),
           SYSUTCDATETIME(), DATEADD(HOUR, 4, SYSUTCDATETIME()),
           30, 30, 1, N'CUSTOM', N'America/Argentina/Buenos_Aires', N'ACTIVE'),
          (@owAfternoon, @companyId, @operationAfternoon, CAST(SYSUTCDATETIME() AS DATE),
           DATEADD(HOUR, 5, SYSUTCDATETIME()), DATEADD(HOUR, 9, SYSUTCDATETIME()),
           30, 30, 1, N'CUSTOM', N'America/Argentina/Buenos_Aires', N'ACTIVE');

        INSERT INTO dbo.employee_workdays (
          id, company_id, operation_workday_id, employee_id, expectation_status
        )
        VALUES
          (@ewMorning, @companyId, @owMorning, @employeeId, N'EXPECTED'),
          (@ewAfternoon, @companyId, @owAfternoon, @employeeId, N'EXPECTED');
      `);
  });

  after(async () => {
    const pool = getPool();
    const cleanup = async (operationId: string, ewId: string) => {
      if (!operationId) return;
      await pool
        .request()
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("ewId", sql.UniqueIdentifier, ewId || null)
        .query(`
          DELETE FROM dbo.whatsapp_attendance_notifications
          WHERE employee_workday_id = @ewId OR operation_id = @operationId;
          DELETE FROM dbo.employee_workdays WHERE operation_workday_id IN (
            SELECT id FROM dbo.operation_workdays WHERE operation_id = @operationId
          );
          DELETE FROM dbo.operation_workdays WHERE operation_id = @operationId;
          DELETE FROM dbo.scheduled_operations WHERE id = @operationId;
        `);
    };
    await cleanup(operationMorning, ewMorning);
    await cleanup(operationAfternoon, ewAfternoon);
    await teardownDatabaseIntegration();
  });

  it("same employee+type claims independently per employee_workday_id", async () => {
    const morning = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId: operationMorning,
      employeeId,
      notificationType: "ARRIVAL_REMINDER_15_MIN",
      scheduleVersion: 1,
      employeeWorkdayId: ewMorning,
    });
    const afternoon = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId: operationAfternoon,
      employeeId,
      notificationType: "ARRIVAL_REMINDER_15_MIN",
      scheduleVersion: 1,
      employeeWorkdayId: ewAfternoon,
    });

    assert.ok(morning);
    assert.ok(afternoon);
    assert.notEqual(morning!.id, afternoon!.id);

    const morningAgain = await attendanceNotificationRepository.claimNotificationForAttempt(
      companyId,
      {
        operationId: operationMorning,
        employeeId,
        notificationType: "ARRIVAL_REMINDER_15_MIN",
        scheduleVersion: 1,
        employeeWorkdayId: ewMorning,
      },
    );
    assert.equal(morningAgain, null);
  });
});
