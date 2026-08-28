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
import { whatsappRetentionService } from "../services/whatsapp-retention.service";

const daysAgo = (days: number, from: Date): Date => {
  const value = new Date(from.getTime());
  value.setUTCDate(value.getUTCDate() - days);
  return value;
};

describeDatabaseIntegration("whatsapp retention cleanup", () => {
  const nowUtc = new Date("2026-08-28T12:00:00.000Z");
  let companyId = "";
  let employeeId = "";
  let operationId = "";
  const tracked: {
    conversations: string[];
    messages: string[];
    webhooks: string[];
    sessions: string[];
    notifications: string[];
    attendanceRecords: string[];
  } = {
    conversations: [],
    messages: [],
    webhooks: [],
    sessions: [],
    notifications: [],
    attendanceRecords: [],
  };

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    const employee = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Retention Emp ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), `+54911${String(Date.now()).slice(-8)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(employee.recordset[0].id);

    const location = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Loc ${randomUUID().slice(0, 6)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO operational_locations (
          company_id, name, address, locality, latitude, longitude, allowed_radius_meters, active
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, N'Addr', N'CABA', -34.6037, -58.3816, 150, 1);
        SELECT id FROM @inserted;
      `);
    const locationId = String(location.recordset[0].id);

    const operation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, locationId)
      .input("start", sql.DateTime2, daysAgo(10, nowUtc))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @serviceId, @start, 60, 90, N'COMPLETED', N'ONE_TIME');
        SELECT id FROM @inserted;
      `);
    operationId = String(operation.recordset[0].id);
  });

  after(async () => {
    const pool = getPool();
    for (const id of tracked.attendanceRecords) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM attendance_records WHERE id = @id`);
    }
    for (const id of tracked.messages) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_messages WHERE id = @id`);
    }
    for (const id of tracked.conversations) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_conversations WHERE id = @id`);
    }
    for (const id of tracked.webhooks) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_webhook_events WHERE id = @id`);
    }
    for (const id of tracked.sessions) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM bot_sessions WHERE id = @id`);
    }
    for (const id of tracked.notifications) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_attendance_notifications WHERE id = @id`);
    }
    if (employeeId) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, employeeId)
        .query(`DELETE FROM employees WHERE id = @id`);
    }
    await teardownDatabaseIntegration();
  });

  async function insertConversation(input: {
    status: string;
    lastActivityAt: Date;
  }): Promise<string> {
    const id = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("status", sql.NVarChar(20), input.status)
      .input("lastActivityAt", sql.DateTime2, input.lastActivityAt)
      .query(`
        INSERT INTO whatsapp_conversations (
          id, company_id, employee_id, phone_hash, phone_masked, phone_normalized,
          started_at, last_activity_at, status
        )
        VALUES (
          @id, @companyId, @employeeId, N'hash-${id}', N'+54911******00', N'v1:retention-test',
          @lastActivityAt, @lastActivityAt, @status
        )
      `);
    tracked.conversations.push(id);
    return id;
  }

  async function insertMessage(conversationId: string, createdAt: Date): Promise<string> {
    const id = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("conversationId", sql.UniqueIdentifier, conversationId)
      .input("createdAt", sql.DateTime2, createdAt)
      .query(`
        INSERT INTO whatsapp_messages (
          id, company_id, conversation_id, direction, phone_from, phone_to,
          message_type, body, created_at
        )
        VALUES (
          @id, @companyId, @conversationId, N'INBOUND', N'+5491100000000', N'+5491199999999',
          N'TEXT', N'test', @createdAt
        )
      `);
    tracked.messages.push(id);
    return id;
  }

  it("dry-run counts candidates without deleting rows", async () => {
    const conversationId = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(31, nowUtc),
    });
    const messageId = await insertMessage(conversationId, daysAgo(31, nowUtc));

    const dryRun = await whatsappRetentionService.runCleanup({
      dryRun: true,
      nowUtc,
      retentionDays: 30,
    });

    assert.equal(dryRun.dryRun, true);
    assert.ok(dryRun.tables.whatsapp_messages.candidates >= 1);
    assert.equal(dryRun.tables.whatsapp_messages.deleted, 0);

    const stillThere = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, messageId)
      .query(`SELECT COUNT(*) AS cnt FROM whatsapp_messages WHERE id = @id`);
    assert.equal(Number(stillThere.recordset[0].cnt), 1);
  });

  it("deletes old terminal WhatsApp rows but preserves active/pending and core attendance", async () => {
    const oldConversationId = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(31, nowUtc),
    });
    const oldMessageId = await insertMessage(oldConversationId, daysAgo(31, nowUtc));

    const recentConversationId = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(29, nowUtc),
    });
    const recentMessageId = await insertMessage(recentConversationId, daysAgo(29, nowUtc));

    const activeConversationId = await insertConversation({
      status: "ACTIVE",
      lastActivityAt: daysAgo(60, nowUtc),
    });
    const activeMessageId = await insertMessage(activeConversationId, daysAgo(60, nowUtc));

    const webhookOldId = randomUUID();
    const webhookOldSid = `SMOLD${randomUUID().replace(/-/g, "").slice(0, 22)}`;
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, webhookOldId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), webhookOldSid)
      .input("createdAt", sql.DateTime2, daysAgo(31, nowUtc))
      .input("processedAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_webhook_events (
          id, company_id, message_sid, event_type, payload_hash,
          processing_status, attempt_count, max_attempts, created_at, updated_at, processed_at
        )
        VALUES (
          @id, @companyId, @messageSid, N'INBOUND_MESSAGE', N'abc123',
          N'PROCESSED', 1, 8, @createdAt, @createdAt, @processedAt
        )
      `);
    tracked.webhooks.push(webhookOldId);

    const webhookPendingId = randomUUID();
    const webhookPendingSid = `SMPEND${randomUUID().replace(/-/g, "").slice(0, 22)}`;
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, webhookPendingId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), webhookPendingSid)
      .input("createdAt", sql.DateTime2, daysAgo(60, nowUtc))
      .query(`
        INSERT INTO whatsapp_webhook_events (
          id, company_id, message_sid, event_type, payload_hash,
          processing_status, attempt_count, max_attempts, processing_expires_at,
          created_at, updated_at
        )
        VALUES (
          @id, @companyId, @messageSid, N'INBOUND_MESSAGE', N'def456',
          N'PROCESSING', 1, 8, DATEADD(HOUR, 1, SYSUTCDATETIME()),
          @createdAt, @createdAt
        )
      `);
    tracked.webhooks.push(webhookPendingId);

    const expiredSessionId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, expiredSessionId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("expiresAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO bot_sessions (
          id, company_id, employee_id, phone_number, state, expires_at, created_at, updated_at
        )
        VALUES (
          @id, @companyId, @employeeId, N'+5491100000001', N'EXPIRED',
          @expiresAt, @expiresAt, @expiresAt
        )
      `);
    tracked.sessions.push(expiredSessionId);

    const activeSessionId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, activeSessionId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO bot_sessions (
          id, company_id, employee_id, phone_number, state, expires_at, created_at, updated_at
        )
        VALUES (
          @id, @companyId, @employeeId, N'+5491100000002', N'WAITING_LOCATION',
          DATEADD(MINUTE, 15, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME()
        )
      `);
    tracked.sessions.push(activeSessionId);

    const notificationOldId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, notificationOldId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("createdAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_attendance_notifications (
          id, company_id, operation_id, employee_id, notification_type, status, created_at
        )
        VALUES (
          @id, @companyId, @operationId, @employeeId, N'ARRIVAL_REMINDER_15_MIN', N'SENT', @createdAt
        )
      `);
    tracked.notifications.push(notificationOldId);

    const notificationPendingId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, notificationPendingId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("createdAt", sql.DateTime2, daysAgo(60, nowUtc))
      .query(`
        INSERT INTO whatsapp_attendance_notifications (
          id, company_id, operation_id, employee_id, notification_type, status, created_at
        )
        VALUES (
          @id, @companyId, @operationId, @employeeId, N'EXIT_REMINDER_15_MIN', N'PENDING', @createdAt
        )
      `);
    tracked.notifications.push(notificationPendingId);

    const attendanceId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, attendanceId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("receivedAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO attendance_records (
          id, company_id, employee_id, operation_id,
          received_latitude, received_longitude, distance_meters,
          validation_status, location_status, punctuality_status, received_at
        )
        VALUES (
          @id, @companyId, @employeeId, @operationId,
          -34.6037, -58.3816, 10, N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME', @receivedAt
        )
      `);
    tracked.attendanceRecords.push(attendanceId);

    const result = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    assert.equal(result.dryRun, false);
    assert.ok(result.tables.whatsapp_messages.deleted >= 1);

    const countRow = async (table: string, id: string): Promise<number> => {
      const row = await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT COUNT(*) AS cnt FROM ${table} WHERE id = @id`);
      return Number(row.recordset[0].cnt);
    };

    assert.equal(await countRow("whatsapp_messages", oldMessageId), 0);
    assert.equal(await countRow("whatsapp_messages", recentMessageId), 1);
    assert.equal(await countRow("whatsapp_messages", activeMessageId), 1);
    assert.equal(await countRow("whatsapp_webhook_events", webhookOldId), 0);
    assert.equal(await countRow("whatsapp_webhook_events", webhookPendingId), 1);
    assert.equal(await countRow("bot_sessions", expiredSessionId), 0);
    assert.equal(await countRow("bot_sessions", activeSessionId), 1);
    assert.equal(await countRow("whatsapp_attendance_notifications", notificationOldId), 0);
    assert.equal(await countRow("whatsapp_attendance_notifications", notificationPendingId), 1);
    assert.equal(await countRow("attendance_records", attendanceId), 1);
  });
});
