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
    const storeId = String(storeResult.recordset[0]?.id ?? "");
    assert.ok(storeId);

    const referenceAt = new Date();
    const scheduledStart = new Date(referenceAt.getTime() + 24 * 60 * 60 * 1000);

    const inventoryInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("storeId", sql.UniqueIdentifier, storeId)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
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
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO operation_assignments (
          company_id, inventory_id, employee_id, confirmation_status, confirmation_schedule_version
        )
        VALUES (@companyId, @inventoryId, @employeeId, 'PENDING', 1)
      `);

    const { env } = await import("../config/env");
    env.TWILIO_ACCOUNT_SID = "AC_TEST";
    env.TWILIO_AUTH_TOKEN = "auth";
    env.TWILIO_WHATSAPP_NUMBER = "whatsapp:+10000000000";
    env.TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID = "HX_CONFIRMATION";
    env.ATTENDANCE_REMINDER_JOB_ENABLED = true;

    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { botSessionService } = await import("./bot-session.service");
    const { attendanceReminderService } = await import("./attendance-reminder.service");

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
      inventoryId,
      phoneNumber: "+5491100000000",
      state: "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE" as const,
      contextJson: null,
      expiresAt: "2099-01-01T00:00:00.000Z",
      createdAt: referenceAt.toISOString(),
      updatedAt: referenceAt.toISOString(),
    }));

    await attendanceReminderService.runDueReminders(companyId, referenceAt);

    const afterFirstRun = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT status, twilio_message_sid, sent_at
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND inventory_id = @inventoryId
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
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT status, twilio_message_sid
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND inventory_id = @inventoryId
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
