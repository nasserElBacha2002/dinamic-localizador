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
import { whatsappLifecycleService } from "./whatsapp-lifecycle.service";

const hoursAgo = (hours: number, from: Date): Date =>
  new Date(from.getTime() - hours * 60 * 60 * 1000);

const daysAgo = (days: number, from: Date): Date =>
  new Date(from.getTime() - days * 24 * 60 * 60 * 1000);

describeDatabaseIntegration("whatsapp lifecycle reconcile", () => {
  let nowUtc = new Date(0);
  let companyId = "";
  let employeeId = "";
  const tracked = {
    conversations: [] as string[],
    flowExecutions: [] as string[],
    webhooks: [] as string[],
  };

  before(async () => {
    process.env.WHATSAPP_LIFECYCLE_JOB_ENABLED = "true";
    process.env.WHATSAPP_LIFECYCLE_DRY_RUN = "false";
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();

    const clock = await getPool().request().query(`SELECT SYSUTCDATETIME() AS now_utc`);
    const raw = clock.recordset[0]?.now_utc as Date | string;
    nowUtc = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(nowUtc.getTime())) {
      throw new Error("SYSUTCDATETIME() did not return a usable timestamp");
    }

    const employee = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Lifecycle Emp ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), `+54911${String(Date.now()).slice(-8)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(employee.recordset[0].id);
  });

  after(async () => {
    const pool = getPool();
    for (const id of tracked.flowExecutions) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_flow_executions WHERE id = @id`);
    }
    for (const id of tracked.webhooks) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_webhook_events WHERE id = @id`);
    }
    for (const id of tracked.conversations) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_conversations WHERE id = @id`);
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
          @id, @companyId, @employeeId, N'hash-${id}', N'+54911******00', N'v1:lifecycle-test',
          @lastActivityAt, @lastActivityAt, @status
        )
      `);
    tracked.conversations.push(id);
    return id;
  }

  async function insertStartedFlow(conversationId: string, startedAt: Date): Promise<string> {
    const id = randomUUID();
    const correlationId = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("conversationId", sql.UniqueIdentifier, conversationId)
      .input("correlationId", sql.UniqueIdentifier, correlationId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("startedAt", sql.DateTime2, startedAt)
      .query(`
        INSERT INTO whatsapp_flow_executions (
          id, conversation_id, correlation_id, company_id, employee_id, flow_type, flow_version,
          status, started_at
        )
        VALUES (
          @id, @conversationId, @correlationId, @companyId, @employeeId, N'ARRIVAL', N'1',
          N'STARTED', @startedAt
        )
      `);
    tracked.flowExecutions.push(id);
    return id;
  }

  async function conversationStatus(id: string): Promise<string> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT status FROM whatsapp_conversations WHERE id = @id`);
    return String(result.recordset[0]?.status ?? "");
  }

  async function flowRow(id: string): Promise<{ status: string; durationMs: number | null }> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT status, duration_ms FROM whatsapp_flow_executions WHERE id = @id`);
    const row = result.recordset[0] as { status: string; duration_ms: number | null };
    return {
      status: String(row.status),
      durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    };
  }

  it("ACTIVE recent stays ACTIVE", async () => {
    const id = await insertConversation({
      status: "ACTIVE",
      lastActivityAt: hoursAgo(2, nowUtc),
    });
    await whatsappLifecycleService.runReconcile({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 5,
    });
    assert.equal(await conversationStatus(id), "ACTIVE");
  });

  it("ACTIVE idle without active work becomes COMPLETED; second run is idempotent", async () => {
    const id = await insertConversation({
      status: "ACTIVE",
      lastActivityAt: hoursAgo(30, nowUtc),
    });
    const first = await whatsappLifecycleService.runReconcile({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 5,
    });
    assert.ok(first.conversationsCompleted >= 1);
    assert.equal(await conversationStatus(id), "COMPLETED");

    const second = await whatsappLifecycleService.runReconcile({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 5,
    });
    assert.equal(await conversationStatus(id), "COMPLETED");
    assert.equal(second.conversationsCompleted, 0);
  });

  it("ACTIVE idle with STARTED flow is not closed until flow is terminalized", async () => {
    const conversationId = await insertConversation({
      status: "ACTIVE",
      lastActivityAt: hoursAgo(48, nowUtc),
    });
    const flowId = await insertStartedFlow(conversationId, hoursAgo(40, nowUtc));

    const first = await whatsappLifecycleService.runReconcile({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 5,
    });
    assert.equal(await conversationStatus(conversationId), "ACTIVE");
    assert.equal((await flowRow(flowId)).status, "FAILED");
    assert.ok(first.flowsFailed >= 1);

    const second = await whatsappLifecycleService.runReconcile({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 5,
    });
    assert.equal(await conversationStatus(conversationId), "COMPLETED");
    assert.ok(second.conversationsCompleted >= 1);
  });

  it("STARTED flow older than 30 days reconciles without duration_ms overflow", async () => {
    const conversationId = await insertConversation({
      status: "ACTIVE",
      lastActivityAt: daysAgo(40, nowUtc),
    });
    const flowId = await insertStartedFlow(conversationId, daysAgo(35, nowUtc));

    await whatsappLifecycleService.runReconcile({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 5,
    });

    const flow = await flowRow(flowId);
    assert.equal(flow.status, "FAILED");
    assert.ok(flow.durationMs !== null);
    assert.ok((flow.durationMs as number) <= 2147483647);
    assert.ok((flow.durationMs as number) > 0);
  });

  it("PROCESSING webhook with expired lease becomes FAILED exhausted (not PROCESSED)", async () => {
    const id = randomUUID();
    const sid = `SMLC${randomUUID().replace(/-/g, "").slice(0, 26)}`;
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("sid", sql.NVarChar(100), sid)
      .input("expires", sql.DateTime2, hoursAgo(2, nowUtc))
      .input("createdAt", sql.DateTime2, hoursAgo(3, nowUtc))
      .query(`
        INSERT INTO whatsapp_webhook_events (
          id, company_id, message_sid, event_type, payload_hash,
          processing_status, attempt_count, max_attempts,
          processing_owner, processing_expires_at, processing_version,
          created_at, updated_at
        )
        VALUES (
          @id, @companyId, @sid, N'INBOUND_MESSAGE', N'hash-lifecycle',
          N'PROCESSING', 1, 8,
          N'owner-stale', @expires, 1,
          @createdAt, @createdAt
        )
      `);
    tracked.webhooks.push(id);

    await whatsappLifecycleService.runReconcile({
      dryRun: false,
      conversationIdleTimeoutHours: 24,
      flowStartedTimeoutHours: 24,
      batchSize: 50,
      maxBatches: 5,
    });

    const row = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT processing_status, attempt_count, max_attempts, next_attempt_at, processing_expires_at
        FROM whatsapp_webhook_events WHERE id = @id
      `);
    const event = row.recordset[0] as Record<string, unknown>;
    assert.equal(String(event.processing_status), "FAILED");
    assert.equal(Number(event.attempt_count), Number(event.max_attempts));
    assert.equal(event.next_attempt_at, null);
    assert.equal(event.processing_expires_at, null);
  });
});
