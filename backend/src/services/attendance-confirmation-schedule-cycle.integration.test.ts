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

describeDatabaseIntegration("attendance confirmation schedule cycle integration", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    mock.restoreAll();
    await teardownDatabaseIntegration();
  });

  it("sends exactly one reminder per schedule version and preserves historical notifications", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE company_settings
        SET confirmation_reminder_enabled = 1,
            confirmation_reminder_hours_before = 24
        WHERE company_id = @companyId
      `);

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

    const initialStart = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const rescheduledStart = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, initialStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED')
      `);
    const operationId = String(operationInsert.recordset[0].id);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneNumber", sql.NVarChar(20), uniquePhone(1))
      .query(`
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id
        VALUES (@companyId, N'Cycle Integration', @phoneNumber, 'fijo', 1)
      `);
    const employeeId = String(employeeInsert.recordset[0].id);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO operation_assignments (
          company_id, operation_id, employee_id, confirmation_status, confirmed_at, confirmation_schedule_version
        )
        VALUES (@companyId, @operationId, @employeeId, 'CONFIRMED', SYSUTCDATETIME(), 1)
      `);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO whatsapp_attendance_notifications (
          company_id, operation_id, employee_id, notification_type, status, attempt_count,
          schedule_version, reminder_source, twilio_message_sid, sent_at
        )
        VALUES (
          @companyId, @operationId, @employeeId, 'ATTENDANCE_CONFIRMATION_REMINDER', 'SENT', 1,
          1, 'AUTOMATIC', 'SM_V1_HISTORICAL', SYSUTCDATETIME()
        )
      `);

    const { operationService } = await import("./operation.service");
    await operationService.update(companyId, operationId, {
      scheduledStart: rescheduledStart.toISOString(),
    });

    const assignmentAfterReschedule = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT confirmation_status, confirmation_schedule_version
        FROM operation_assignments
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
      `);
    const assignmentRow = assignmentAfterReschedule.recordset[0] as {
      confirmation_status: string;
      confirmation_schedule_version: number;
    };
    assert.equal(assignmentRow.confirmation_status, "PENDING");
    assert.equal(assignmentRow.confirmation_schedule_version, 2);

    const historicalNotification = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT schedule_version, status, twilio_message_sid
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND schedule_version = 1
      `);
    const historicalRow = historicalNotification.recordset[0] as {
      schedule_version: number;
      status: string;
      twilio_message_sid: string;
    };
    assert.equal(historicalRow.schedule_version, 1);
    assert.equal(historicalRow.status, "SENT");
    assert.equal(historicalRow.twilio_message_sid, "SM_V1_HISTORICAL");

    const { env } = await import("../config/env");
    env.TWILIO_ACCOUNT_SID = "AC_TEST";
    env.TWILIO_AUTH_TOKEN = "auth";
    env.TWILIO_WHATSAPP_NUMBER = "whatsapp:+10000000000";
    env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID = "HX_ARRIVAL";
    env.TWILIO_EXIT_REMINDER_CONTENT_SID = "HX_EXIT";
    env.TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID = "HX_CONFIRMATION";
    env.ATTENDANCE_REMINDER_JOB_ENABLED = true;

    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");
    const { attendanceReminderService } = await import("./attendance-reminder.service");

    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_V2_CYCLE",
    }));
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () => ({
      id: "session-cycle-v2",
      companyId,
      employeeId,
      operationId,
      phoneNumber: "+5491100000000",
      state: "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE" as const,
      contextJson: null,
      expiresAt: "2099-01-01T00:00:00.000Z",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const referenceAt = new Date(rescheduledStart.getTime() - 24 * 60 * 60 * 1000);
    await attendanceReminderService.runDueReminders(companyId, referenceAt);
    assert.equal(sendMock.mock.callCount(), 1);

    const versionTwoNotifications = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT status, schedule_version, twilio_message_sid
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND schedule_version = 2
      `);
    assert.equal(versionTwoNotifications.recordset.length, 1);
    const versionTwoRow = versionTwoNotifications.recordset[0] as {
      status: string;
      schedule_version: number;
      twilio_message_sid: string;
    };
    assert.equal(versionTwoRow.status, "SENT");
    assert.equal(versionTwoRow.schedule_version, 2);
    assert.equal(versionTwoRow.twilio_message_sid, "SM_V2_CYCLE");

    await attendanceReminderService.runDueReminders(companyId, referenceAt);
    assert.equal(sendMock.mock.callCount(), 1);

    const versionTwoCount = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND schedule_version = 2
      `);
    assert.equal(Number((versionTwoCount.recordset[0] as { total: number }).total), 1);
  });
});
