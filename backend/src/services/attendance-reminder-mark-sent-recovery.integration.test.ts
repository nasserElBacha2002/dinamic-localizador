import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { ATTENDANCE_REMINDER_STALE_PENDING_MINUTES } from "../constants/attendance-notification";

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;

describeDatabaseIntegration("attendance reminder markSent recovery integration", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    mock.restoreAll();
    await teardownDatabaseIntegration();
  });

  it("persists SENT_RECOVERY_REQUIRED directly in the repository", async () => {
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

    const inventoryInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, new Date(Date.now() + 5 * 24 * 60 * 60 * 1000))
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED')
      `);
    const operationId = String(inventoryInsert.recordset[0].id);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneNumber", sql.NVarChar(20), uniquePhone())
      .query(`
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id
        VALUES (@companyId, N'Recovery Repo', @phoneNumber, 'fijo', 1)
      `);
    const employeeId = String(employeeInsert.recordset[0].id);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );

    const claimed = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId,
      employeeId,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
      scheduleVersion: 1,
    });
    assert.ok(claimed);

    await attendanceNotificationRepository.markSentRecoveryRequired(companyId, {
      notificationId: claimed.id,
      twilioMessageSid: "SM_DIRECT_RECOVERY",
      sentAt: new Date(),
      errorMessage: "markSent failed",
    });

    const row = await attendanceNotificationRepository.findByInventoryEmployeeType(companyId, {
      operationId,
      employeeId,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
      scheduleVersion: 1,
    });
    assert.equal(row?.status, "SENT_RECOVERY_REQUIRED");
    assert.equal(row?.twilioMessageSid, "SM_DIRECT_RECOVERY");
  });

  it("prevents duplicate Twilio sends when markSent fails after successful delivery", async () => {
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

    const referenceAt = new Date();
    const scheduledStart = new Date(referenceAt.getTime() + 24 * 60 * 60 * 1000);

    const inventoryInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED')
      `);
    const operationId = String(inventoryInsert.recordset[0].id);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneNumber", sql.NVarChar(20), uniquePhone())
      .query(`
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id
        VALUES (@companyId, N'Recovery Integration', @phoneNumber, 'fijo', 1)
      `);
    const employeeId = String(employeeInsert.recordset[0].id);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO operation_assignments (
          company_id, operation_id, employee_id, confirmation_status, confirmation_schedule_version
        )
        VALUES (@companyId, @operationId, @employeeId, 'PENDING', 1)
      `);

    const { env } = await import("../config/env");
    env.TWILIO_ACCOUNT_SID = "AC_TEST";
    env.TWILIO_AUTH_TOKEN = "auth";
    env.TWILIO_WHATSAPP_NUMBER = "whatsapp:+10000000000";
    env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID = "HX_ARRIVAL";
    env.TWILIO_EXIT_REMINDER_CONTENT_SID = "HX_EXIT";
    env.TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID = "HX_CONFIRMATION";
    env.ATTENDANCE_REMINDER_JOB_ENABLED = true;

    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { botSessionService } = await import("./bot-session.service");

    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_RECOVERY_INTEGRATION",
    }));
    mock.method(attendanceNotificationRepository, "markSent", async () => {
      throw new Error("markSent failed");
    });
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () => ({
      id: "session-recovery",
      companyId,
      employeeId,
      operationId,
      phoneNumber: "+5491100000000",
      state: "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE" as const,
      contextJson: null,
      expiresAt: "2099-01-01T00:00:00.000Z",
      createdAt: referenceAt.toISOString(),
      updatedAt: referenceAt.toISOString(),
    }));

    const { attendanceReminderService } = await import("./attendance-reminder.service");

    const outcome = await attendanceReminderService.sendTestReminder(companyId, {
      operationId,
      employeeId,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    });

    assert.equal(outcome, "sent");
    assert.equal(sendMock.mock.callCount(), 1);

    const afterFirstRun = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT status, twilio_message_sid, sent_at
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND notification_type = 'ATTENDANCE_CONFIRMATION_REMINDER'
          AND schedule_version = 1
      `);

    const firstRow = afterFirstRun.recordset[0] as {
      status: string;
      twilio_message_sid: string | null;
      sent_at: Date | null;
    };
    assert.equal(firstRow.status, "SENT_RECOVERY_REQUIRED");
    assert.equal(firstRow.twilio_message_sid, "SM_RECOVERY_INTEGRATION");
    assert.ok(firstRow.sent_at);

    const staleReferenceAt = new Date(
      referenceAt.getTime() + (ATTENDANCE_REMINDER_STALE_PENDING_MINUTES + 1) * 60_000,
    );
    await attendanceReminderService.runDueReminders(companyId, staleReferenceAt);
    assert.equal(sendMock.mock.callCount(), 1);

    mock.restoreAll();
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_RECOVERY_INTEGRATION",
    }));

    await attendanceReminderService.runDueReminders(companyId, staleReferenceAt);

    const afterReconcile = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT status, twilio_message_sid
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND notification_type = 'ATTENDANCE_CONFIRMATION_REMINDER'
          AND schedule_version = 1
      `);

    const reconciledRow = afterReconcile.recordset[0] as {
      status: string;
      twilio_message_sid: string | null;
    };
    assert.equal(reconciledRow.status, "SENT");
    assert.equal(reconciledRow.twilio_message_sid, "SM_RECOVERY_INTEGRATION");
    assert.equal(sendMock.mock.callCount(), 1);
  });
});
