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
    flowExecutions: string[];
    flowSteps: string[];
    flowCandidates: string[];
    providerEvents: string[];
    payrollDeliveries: string[];
  } = {
    conversations: [],
    messages: [],
    webhooks: [],
    sessions: [],
    notifications: [],
    attendanceRecords: [],
    flowExecutions: [],
    flowSteps: [],
    flowCandidates: [],
    providerEvents: [],
    payrollDeliveries: [],
  };

  before(async () => {
    process.env.WHATSAPP_RETENTION_CLEANUP_JOB_ENABLED = "true";
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
    for (const id of tracked.payrollDeliveries) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_payroll_receipt_query_deliveries WHERE id = @id`);
    }
    for (const id of tracked.flowCandidates) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_flow_candidates WHERE id = @id`);
    }
    for (const id of tracked.flowSteps) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_flow_steps WHERE id = @id`);
    }
    for (const id of tracked.providerEvents) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_provider_events WHERE id = @id`);
    }
    for (const id of tracked.flowExecutions) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_flow_executions WHERE id = @id`);
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
    assert.equal(await countRow("employees", employeeId), 1);
    assert.equal(await countRow("scheduled_operations", operationId), 1);
  });

  async function insertFkGraph(): Promise<{
    conversationId: string;
    messageId: string;
    providerEventId: string;
    flowExecutionId: string;
    flowStepId: string;
    flowCandidateId: string;
  }> {
    const conversationId = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(31, nowUtc),
    });
    const messageId = await insertMessage(conversationId, daysAgo(31, nowUtc));
    const providerEventId = randomUUID();
    const providerSid = `SMPE${randomUUID().replace(/-/g, "")}`;
    const providerEventKey = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, providerEventId)
      .input("messageId", sql.UniqueIdentifier, messageId)
      .input("providerSid", sql.NVarChar(100), providerSid.slice(0, 100))
      .input("providerEventKey", sql.NVarChar(200), providerEventKey)
      .input("receivedAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_provider_events (
          id, message_id, provider_message_sid, event_type, provider_status,
          provider_event_key, received_at, created_at
        )
        VALUES (
          @id, @messageId, @providerSid, N'STATUS', N'delivered',
          @providerEventKey, @receivedAt, @receivedAt
        )
      `);
    tracked.providerEvents.push(providerEventId);

    const flowExecutionId = randomUUID();
    const correlationId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, flowExecutionId)
      .input("conversationId", sql.UniqueIdentifier, conversationId)
      .input("messageId", sql.UniqueIdentifier, messageId)
      .input("correlationId", sql.UniqueIdentifier, correlationId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("startedAt", sql.DateTime2, daysAgo(31, nowUtc))
      .input("finishedAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_flow_executions (
          id, conversation_id, source_message_id, correlation_id, company_id, employee_id,
          flow_type, flow_version, status, started_at, finished_at, created_at
        )
        VALUES (
          @id, @conversationId, @messageId, @correlationId, @companyId, @employeeId,
          N'ATTENDANCE_CHECKIN', N'1', N'COMPLETED', @startedAt, @finishedAt, @startedAt
        )
      `);

    tracked.flowExecutions.push(flowExecutionId);

    const flowStepId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, flowStepId)
      .input("flowExecutionId", sql.UniqueIdentifier, flowExecutionId)
      .query(`
        INSERT INTO whatsapp_flow_steps (
          id, flow_execution_id, sequence, step_type, step_name, status, created_at
        )
        VALUES (
          @id, @flowExecutionId, 1, N'VALIDATE', N'validate-location', N'SUCCESS', SYSUTCDATETIME()
        )
      `);

    tracked.flowSteps.push(flowStepId);

    const flowCandidateId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, flowCandidateId)
      .input("flowExecutionId", sql.UniqueIdentifier, flowExecutionId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        INSERT INTO whatsapp_flow_candidates (
          id, flow_execution_id, candidate_type, company_id, accepted, sequence, created_at
        )
        VALUES (
          @id, @flowExecutionId, N'OPERATION', @companyId, 0, 0, SYSUTCDATETIME()
        )
      `);

    tracked.flowCandidates.push(flowCandidateId);

    return {
      conversationId,
      messageId,
      providerEventId,
      flowExecutionId,
      flowStepId,
      flowCandidateId,
    };
  }

  it("purges FK graph children before parents without orphan rows", async () => {
    const graph = await insertFkGraph();

    const result = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    assert.equal(result.dryRun, false);
    assert.ok(result.tables.whatsapp_flow_candidates.deleted >= 1);
    assert.ok(result.tables.whatsapp_messages.deleted >= 1);

    const countRow = async (table: string, id: string): Promise<number> => {
      const row = await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT COUNT(*) AS cnt FROM ${table} WHERE id = @id`);
      return Number(row.recordset[0].cnt);
    };

    assert.equal(await countRow("whatsapp_flow_candidates", graph.flowCandidateId), 0);
    assert.equal(await countRow("whatsapp_flow_steps", graph.flowStepId), 0);
    assert.equal(await countRow("whatsapp_provider_events", graph.providerEventId), 0);
    assert.equal(await countRow("whatsapp_flow_executions", graph.flowExecutionId), 0);
    assert.equal(await countRow("whatsapp_messages", graph.messageId), 0);
    assert.equal(await countRow("whatsapp_conversations", graph.conversationId), 0);
  });

  it("dry-run on FK graph counts candidates without modifying rows", async () => {
    const graph = await insertFkGraph();

    const dryRun = await whatsappRetentionService.runCleanup({
      dryRun: true,
      nowUtc,
      retentionDays: 30,
    });

    assert.equal(dryRun.dryRun, true);
    assert.ok(dryRun.tables.whatsapp_flow_candidates.candidates >= 1);
    assert.ok(dryRun.tables.whatsapp_provider_events.candidates >= 1);
    assert.equal(dryRun.tables.whatsapp_messages.candidates, 0);
    assert.equal(dryRun.tables.whatsapp_messages.deleted, 0);

    const countRow = async (table: string, id: string): Promise<number> => {
      const row = await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT COUNT(*) AS cnt FROM ${table} WHERE id = @id`);
      return Number(row.recordset[0].cnt);
    };

    assert.equal(await countRow("whatsapp_flow_candidates", graph.flowCandidateId), 1);
    assert.equal(await countRow("whatsapp_messages", graph.messageId), 1);
    assert.equal(await countRow("whatsapp_conversations", graph.conversationId), 1);
  });

  it("keeps non-terminal STARTED flow executions even when old", async () => {
    const conversationId = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(31, nowUtc),
    });
    const flowExecutionId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, flowExecutionId)
      .input("conversationId", sql.UniqueIdentifier, conversationId)
      .input("correlationId", sql.UniqueIdentifier, randomUUID())
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("startedAt", sql.DateTime2, daysAgo(60, nowUtc))
      .query(`
        INSERT INTO whatsapp_flow_executions (
          id, conversation_id, correlation_id, company_id, flow_type, flow_version,
          status, started_at, created_at
        )
        VALUES (
          @id, @conversationId, @correlationId, @companyId, N'ATTENDANCE_CHECKIN', N'1',
          N'STARTED', @startedAt, @startedAt
        )
      `);
    tracked.flowExecutions.push(flowExecutionId);

    await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    const row = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, flowExecutionId)
      .query(`SELECT COUNT(*) AS cnt FROM whatsapp_flow_executions WHERE id = @id`);
    assert.equal(Number(row.recordset[0].cnt), 1);
  });

  it("respects batchSize and maxBatchesPerTable across runs", async () => {
    const webhookIds: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const id = randomUUID();
      const sid = `SMBAT${i}${randomUUID().replace(/-/g, "").slice(0, 18)}`;
      await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("messageSid", sql.NVarChar(100), sid)
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
      webhookIds.push(id);
      tracked.webhooks.push(id);
    }

    const firstRun = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 5,
      maxBatchesPerTable: 2,
    });

    assert.equal(firstRun.tables.whatsapp_webhook_events.deleted, 10);

    let remaining = 0;
    for (const id of webhookIds) {
      const row = await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`SELECT COUNT(*) AS cnt FROM whatsapp_webhook_events WHERE id = @id`);
      remaining += Number(row.recordset[0].cnt);
    }
    assert.equal(remaining, 2);

    const secondRun = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 5,
      maxBatchesPerTable: 2,
    });
    assert.equal(secondRun.tables.whatsapp_webhook_events.deleted, 2);
  });

  it("continues after a simulated table failure and completes on the next run", async () => {
    const conversationId = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(31, nowUtc),
    });
    const messageId = await insertMessage(conversationId, daysAgo(31, nowUtc));

    const webhookId = randomUUID();
    const webhookSid = `SMFAIL${randomUUID().replace(/-/g, "").slice(0, 22)}`;
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, webhookId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), webhookSid)
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
    tracked.webhooks.push(webhookId);

    const failedRun = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
      simulateTableError: "whatsapp_webhook_events",
    });

    assert.equal(failedRun.tables.whatsapp_webhook_events.errors, "SIMULATED_TABLE_FAILURE");
    assert.ok(failedRun.tables.whatsapp_messages.deleted >= 1);

    const messageAfterFail = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, messageId)
      .query(`SELECT COUNT(*) AS cnt FROM whatsapp_messages WHERE id = @id`);
    assert.equal(Number(messageAfterFail.recordset[0].cnt), 0);

    const webhookStill = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, webhookId)
      .query(`SELECT COUNT(*) AS cnt FROM whatsapp_webhook_events WHERE id = @id`);
    assert.equal(Number(webhookStill.recordset[0].cnt), 1);

    const recoveryRun = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });
    assert.ok(recoveryRun.tables.whatsapp_webhook_events.deleted >= 1);
    assert.equal(await countRow("whatsapp_webhook_events", webhookId), 0);
  });

  it("uses strict less-than cutoff: 29d KEEP, exactly 30d KEEP, 31d DELETE", async () => {
    const conversation29 = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(29, nowUtc),
    });
    const message29 = await insertMessage(conversation29, daysAgo(29, nowUtc));

    const conversation30 = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(30, nowUtc),
    });
    const message30 = await insertMessage(conversation30, daysAgo(30, nowUtc));

    const conversation31 = await insertConversation({
      status: "COMPLETED",
      lastActivityAt: daysAgo(31, nowUtc),
    });
    const message31 = await insertMessage(conversation31, daysAgo(31, nowUtc));

    await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    assert.equal(await countRow("whatsapp_messages", message29), 1);
    assert.equal(await countRow("whatsapp_messages", message30), 1);
    assert.equal(await countRow("whatsapp_messages", message31), 0);
  });

  it("preserves audit_logs row count across cleanup", async () => {
    const before = await getPool().query(`SELECT COUNT(*) AS cnt FROM audit_logs`);
    const auditCountBefore = Number(before.recordset[0].cnt);

    await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    const after = await getPool().query(`SELECT COUNT(*) AS cnt FROM audit_logs`);
    assert.equal(Number(after.recordset[0].cnt), auditCountBefore);
  });

  it("second cleanup run is idempotent with zero deletions", async () => {
    const first = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });
    const second = await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    assert.equal(
      Object.values(second.tables).every((m) => m.deleted === 0 && !m.errors),
      true,
    );
    assert.equal(await countRow("employees", employeeId), 1);
    assert.equal(await countRow("scheduled_operations", operationId), 1);
    assert.ok(first.durationMs >= 0);
  });

  it("webhook events respect terminality and active processing lease", async () => {
    const processedId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, processedId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), `SMWHPRO${randomUUID().replace(/-/g, "").slice(0, 20)}`)
      .input("createdAt", sql.DateTime2, daysAgo(31, nowUtc))
      .input("processedAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_webhook_events (
          id, company_id, message_sid, event_type, payload_hash,
          processing_status, attempt_count, max_attempts, created_at, updated_at, processed_at
        )
        VALUES (
          @id, @companyId, @messageSid, N'INBOUND_MESSAGE', N'abc',
          N'PROCESSED', 1, 8, @createdAt, @createdAt, @processedAt
        )
      `);
    tracked.webhooks.push(processedId);

    const processingId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, processingId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), `SMWHPRG${randomUUID().replace(/-/g, "").slice(0, 20)}`)
      .input("createdAt", sql.DateTime2, daysAgo(60, nowUtc))
      .query(`
        INSERT INTO whatsapp_webhook_events (
          id, company_id, message_sid, event_type, payload_hash,
          processing_status, attempt_count, max_attempts, processing_expires_at,
          created_at, updated_at
        )
        VALUES (
          @id, @companyId, @messageSid, N'INBOUND_MESSAGE', N'def',
          N'PROCESSING', 1, 8, DATEADD(HOUR, 1, SYSUTCDATETIME()),
          @createdAt, @createdAt
        )
      `);
    tracked.webhooks.push(processingId);

    const failedRetryId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, failedRetryId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), `SMWHFRR${randomUUID().replace(/-/g, "").slice(0, 20)}`)
      .input("createdAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_webhook_events (
          id, company_id, message_sid, event_type, payload_hash,
          processing_status, attempt_count, max_attempts, created_at, updated_at
        )
        VALUES (
          @id, @companyId, @messageSid, N'INBOUND_MESSAGE', N'ghi',
          N'FAILED', 2, 8, @createdAt, @createdAt
        )
      `);
    tracked.webhooks.push(failedRetryId);

    const failedTerminalId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, failedTerminalId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), `SMWHFRT${randomUUID().replace(/-/g, "").slice(0, 20)}`)
      .input("createdAt", sql.DateTime2, daysAgo(31, nowUtc))
      .input("processedAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_webhook_events (
          id, company_id, message_sid, event_type, payload_hash,
          processing_status, attempt_count, max_attempts, created_at, updated_at, processed_at
        )
        VALUES (
          @id, @companyId, @messageSid, N'INBOUND_MESSAGE', N'jkl',
          N'FAILED', 8, 8, @createdAt, @createdAt, @processedAt
        )
      `);
    tracked.webhooks.push(failedTerminalId);

    await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    assert.equal(await countRow("whatsapp_webhook_events", processedId), 0);
    assert.equal(await countRow("whatsapp_webhook_events", processingId), 1);
    assert.equal(await countRow("whatsapp_webhook_events", failedRetryId), 1);
    assert.equal(await countRow("whatsapp_webhook_events", failedTerminalId), 0);
  });

  it("purges payroll query delivery before terminal bot session", async () => {
    const sessionId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, sessionId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("expiresAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO bot_sessions (
          id, company_id, employee_id, phone_number, state, expires_at, created_at, updated_at
        )
        VALUES (
          @id, @companyId, @employeeId, N'+5491100000099', N'EXPIRED',
          @expiresAt, @expiresAt, @expiresAt
        )
      `);
    tracked.sessions.push(sessionId);

    const batchId = randomUUID();
    const receiptId = randomUUID();
    await getPool()
      .request()
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO payroll_receipt_batches (id, company_id, year, month, status, total_files)
        VALUES (@batchId, @companyId, 2099, 6, N'COMPLETED', 1);
        INSERT INTO payroll_receipts (
          id, batch_id, company_id, employee_id, year, month,
          original_filename, storage_provider, storage_object_key, status
        )
        VALUES (
          @receiptId, @batchId, @companyId, @employeeId, 2099, 6,
          N'retention-delivery.pdf', N'GOOGLE_CLOUD_STORAGE', N'test/delivery.pdf', N'ASSOCIATED'
        );
      `);

    const deliveryId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, deliveryId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("sessionId", sql.UniqueIdentifier, sessionId)
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("createdAt", sql.DateTime2, daysAgo(31, nowUtc))
      .query(`
        INSERT INTO whatsapp_payroll_receipt_query_deliveries (
          id, company_id, bot_session_id, payroll_receipt_id, employee_id,
          year, month, status, created_at, updated_at
        )
        VALUES (
          @id, @companyId, @sessionId, @receiptId, @employeeId,
          2099, 6, N'ACCEPTED', @createdAt, @createdAt
        )
      `);
    tracked.payrollDeliveries.push(deliveryId);

    await whatsappRetentionService.runCleanup({
      dryRun: false,
      nowUtc,
      retentionDays: 30,
      batchSize: 200,
      maxBatchesPerTable: 20,
    });

    assert.equal(await countRow("whatsapp_payroll_receipt_query_deliveries", deliveryId), 0);
    assert.equal(await countRow("bot_sessions", sessionId), 0);

    await getPool()
      .request()
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM payroll_receipts WHERE id = @receiptId AND company_id = @companyId;
        DELETE FROM payroll_receipt_batches WHERE id = @batchId AND company_id = @companyId;
      `);
  });

  async function countRow(table: string, id: string): Promise<number> {
    const row = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT COUNT(*) AS cnt FROM ${table} WHERE id = @id`);
    return Number(row.recordset[0].cnt);
  }
});
