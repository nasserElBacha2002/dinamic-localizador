import sql from "mssql";
import { getPool } from "../database/connection";
import { mapWhatsAppMessageRow } from "../utils/row-mappers";
import type { WhatsAppMessage } from "../types/twilio.types";
import type { WhatsappConversation } from "../types/whatsapp-observability";
import { whatsappConversationRepository } from "./whatsapp-conversation.repository";
import { whatsappFlowExecutionRepository } from "./whatsapp-flow-execution.repository";
import { whatsappProviderEventRepository } from "./whatsapp-provider-event.repository";
import { maskPhoneForObservability } from "../utils/whatsapp-observability";

export interface ConversationListFilters {
  companyId?: string;
  employeeId?: string;
  phone?: string;
  from?: string;
  to?: string;
  flowType?: string;
  resultCode?: string;
  status?: string;
  hasError?: boolean;
  search?: string;
  page: number;
  limit: number;
}

const mapConversation = (row: Record<string, unknown>): WhatsappConversation => ({
  id: String(row.id),
  companyId: row.company_id ? String(row.company_id) : null,
  employeeId: row.employee_id ? String(row.employee_id) : null,
  phoneHash: String(row.phone_hash),
  phoneMasked: String(row.phone_masked),
  phoneNormalized: String(row.phone_normalized),
  startedAt: new Date(row.started_at as Date | string).toISOString(),
  lastActivityAt: new Date(row.last_activity_at as Date | string).toISOString(),
  status: String(row.status) as WhatsappConversation["status"],
  lastFlowType: row.last_flow_type ? String(row.last_flow_type) : null,
  lastResultCode: row.last_result_code ? String(row.last_result_code) : null,
  messageCount: Number(row.message_count ?? 0),
  errorCount: Number(row.error_count ?? 0),
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
});

export const whatsappObservabilityRepository = {
  async listConversations(filters: ConversationListFilters): Promise<{
    data: Array<Omit<WhatsappConversation, "phoneNormalized"> & { phoneNormalized?: never }>;
    total: number;
  }> {
    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;

    const applyFilters = (request: sql.Request): string => {
      const where: string[] = ["1=1"];
      if (filters.companyId) {
        request.input("companyId", sql.UniqueIdentifier, filters.companyId);
        where.push("c.company_id = @companyId");
      }
      if (filters.employeeId) {
        request.input("employeeId", sql.UniqueIdentifier, filters.employeeId);
        where.push("c.employee_id = @employeeId");
      }
      if (filters.status) {
        request.input("status", sql.NVarChar(20), filters.status);
        where.push("c.status = @status");
      }
      if (filters.flowType) {
        request.input("flowType", sql.NVarChar(60), filters.flowType);
        where.push("c.last_flow_type = @flowType");
      }
      if (filters.resultCode) {
        request.input("resultCode", sql.NVarChar(80), filters.resultCode);
        where.push("c.last_result_code = @resultCode");
      }
      if (filters.hasError === true) {
        where.push("c.error_count > 0");
      }
      if (filters.hasError === false) {
        where.push("c.error_count = 0");
      }
      if (filters.from) {
        request.input("fromAt", sql.DateTime2, new Date(filters.from));
        where.push("c.last_activity_at >= @fromAt");
      }
      if (filters.to) {
        request.input("toAt", sql.DateTime2, new Date(filters.to));
        where.push("c.last_activity_at <= @toAt");
      }
      if (filters.phone) {
        const digits = filters.phone.replace(/\D/g, "");
        request.input("phoneLike", sql.NVarChar(40), `%${digits.slice(-6)}%`);
        where.push("(c.phone_masked LIKE @phoneLike OR c.phone_normalized LIKE @phoneLike)");
      }
      if (filters.search) {
        request.input("search", sql.NVarChar(120), `%${filters.search.slice(0, 100)}%`);
        where.push(
          "(c.phone_masked LIKE @search OR c.last_result_code LIKE @search OR c.last_flow_type LIKE @search)",
        );
      }
      return where.join(" AND ");
    };

    const countRequest = pool.request();
    const whereSql = applyFilters(countRequest);
    const countResult = await countRequest.query(`
      SELECT COUNT(1) AS total
      FROM whatsapp_conversations c
      WHERE ${whereSql}
    `);
    const total = Number((countResult.recordset[0] as { total: number }).total ?? 0);

    const listRequest = pool.request();
    applyFilters(listRequest);
    listRequest.input("offset", sql.Int, offset);
    listRequest.input("limit", sql.Int, filters.limit);

    const listResult = await listRequest.query(`
      SELECT c.*
      FROM whatsapp_conversations c
      WHERE ${whereSql}
      ORDER BY c.last_activity_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = (listResult.recordset as Record<string, unknown>[]).map((row) => {
      const conversation = mapConversation(row);
      const { phoneNormalized: _hidden, ...rest } = conversation;
      return rest;
    });

    return { data, total };
  },

  async getConversationDetail(conversationId: string) {
    const conversation = await whatsappConversationRepository.findById(conversationId);
    if (!conversation) {
      return null;
    }
    const executions = await whatsappFlowExecutionRepository.listByConversation(conversationId);
    const { phoneNormalized: _hidden, ...safe } = conversation;
    return {
      ...safe,
      recentExecutions: executions.slice(0, 20).map((execution) => ({
        id: execution.id,
        flowType: execution.flowType,
        status: execution.status,
        resultCode: execution.resultCode,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
        durationMs: execution.durationMs,
        errorCode: execution.errorCode,
      })),
    };
  },

  async revealPhone(conversationId: string): Promise<string | null> {
    const conversation = await whatsappConversationRepository.findById(conversationId);
    return conversation?.phoneNormalized ?? null;
  },

  async listMessages(
    conversationId: string,
    query: {
      limit: number;
      beforeCreatedAt?: string;
      beforeId?: string;
      direction?: string;
    },
  ): Promise<{
    data: WhatsAppMessage[];
    hasMore: boolean;
    nextCursor: { createdAt: string; id: string } | null;
  }> {
    const pool = getPool();
    const fetchLimit = query.limit + 1;
    const request = pool
      .request()
      .input("conversationId", sql.UniqueIdentifier, conversationId)
      .input("limit", sql.Int, fetchLimit)
      .input("direction", sql.NVarChar(20), query.direction ?? null)
      .input("beforeCreatedAt", sql.DateTime2, query.beforeCreatedAt ?? null)
      .input("beforeId", sql.UniqueIdentifier, query.beforeId ?? null);

    const listResult = await request.query(`
      SELECT TOP (@limit)
        id,
        message_sid,
        direction,
        employee_id,
        phone_from,
        phone_to,
        message_type,
        body,
        latitude,
        longitude,
        status,
        processing_status,
        processing_error_code,
        processed_at,
        created_at,
        conversation_id,
        correlation_id,
        causation_id,
        provider,
        provider_message_sid,
        template_sid,
        template_name,
        template_variables_json,
        provider_status,
        provider_error_code,
        provider_error_message,
        sent_at,
        delivered_at,
        read_at,
        failed_at,
        updated_at,
        notification_id
      FROM whatsapp_messages
      WHERE conversation_id = @conversationId
        AND (@direction IS NULL OR direction = @direction)
        AND (
          @beforeCreatedAt IS NULL
          OR created_at < @beforeCreatedAt
          OR (created_at = @beforeCreatedAt AND id < @beforeId)
        )
      ORDER BY created_at DESC, id DESC
    `);

    const newestFirst = (listResult.recordset as Record<string, unknown>[]).map(
      mapWhatsAppMessageRow,
    );
    const hasMore = newestFirst.length > query.limit;
    const pageNewestFirst = hasMore ? newestFirst.slice(0, query.limit) : newestFirst;
    const oldestInPage = pageNewestFirst[pageNewestFirst.length - 1];
    const nextCursor =
      hasMore && oldestInPage
        ? { createdAt: oldestInPage.createdAt, id: oldestInPage.id }
        : null;

    // Chronological ASC within the loaded window for chat UI.
    return {
      data: [...pageNewestFirst].reverse(),
      hasMore,
      nextCursor,
    };
  },

  async getMessageDetail(messageId: string) {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, messageId)
      .query(`SELECT TOP 1 * FROM whatsapp_messages WHERE id = @id`);
    if (!result.recordset[0]) {
      return null;
    }
    const message = mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
    const providerEvents = message.providerMessageSid
      ? await whatsappProviderEventRepository.listByMessageSid(message.providerMessageSid)
      : await whatsappProviderEventRepository.listByMessageId(messageId);

    return {
      ...message,
      providerEvents,
    };
  },

  async getFlowExecutionDetail(flowExecutionId: string) {
    const execution = await whatsappFlowExecutionRepository.findById(flowExecutionId);
    if (!execution) {
      return null;
    }
    const [steps, candidates] = await Promise.all([
      whatsappFlowExecutionRepository.listSteps(flowExecutionId),
      whatsappFlowExecutionRepository.listCandidates(flowExecutionId),
    ]);
    return { ...execution, steps, candidates };
  },

  async listErrors(input: {
    companyId?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }): Promise<{
    data: Array<{
      errorCode: string;
      count: number;
      lastSeenAt: string;
      sampleConversationId: string | null;
      sampleFlowExecutionId: string | null;
    }>;
    total: number;
  }> {
    const pool = getPool();
    const offset = (input.page - 1) * input.limit;
    const request = pool.request();
    const where = ["(e.error_code IS NOT NULL OR e.result_code IS NOT NULL)", "e.status IN ('FAILED','PARTIALLY_RECORDED')"];

    if (input.companyId) {
      request.input("companyId", sql.UniqueIdentifier, input.companyId);
      where.push("e.company_id = @companyId");
    }
    if (input.from) {
      request.input("fromAt", sql.DateTime2, new Date(input.from));
      where.push("e.started_at >= @fromAt");
    }
    if (input.to) {
      request.input("toAt", sql.DateTime2, new Date(input.to));
      where.push("e.started_at <= @toAt");
    }

    const whereSql = where.join(" AND ");
    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, input.limit);

    const countResult = await request.query(`
      SELECT COUNT(1) AS total FROM (
        SELECT COALESCE(e.error_code, e.result_code) AS error_code
        FROM whatsapp_flow_executions e
        WHERE ${whereSql}
        GROUP BY COALESCE(e.error_code, e.result_code)
      ) grouped
    `);
    const total = Number((countResult.recordset[0] as { total: number }).total ?? 0);

    const listResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId ?? null)
      .input("fromAt", sql.DateTime2, input.from ? new Date(input.from) : null)
      .input("toAt", sql.DateTime2, input.to ? new Date(input.to) : null)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, input.limit)
      .query(`
        SELECT
          COALESCE(e.error_code, e.result_code) AS error_code,
          COUNT(1) AS cnt,
          MAX(e.started_at) AS last_seen_at,
          MAX(CAST(e.conversation_id AS NVARCHAR(36))) AS sample_conversation_id,
          MAX(CAST(e.id AS NVARCHAR(36))) AS sample_flow_execution_id
        FROM whatsapp_flow_executions e
        WHERE (e.error_code IS NOT NULL OR e.result_code IS NOT NULL)
          AND e.status IN ('FAILED','PARTIALLY_RECORDED')
          AND (@companyId IS NULL OR e.company_id = @companyId)
          AND (@fromAt IS NULL OR e.started_at >= @fromAt)
          AND (@toAt IS NULL OR e.started_at <= @toAt)
        GROUP BY COALESCE(e.error_code, e.result_code)
        ORDER BY MAX(e.started_at) DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return {
      total,
      data: (listResult.recordset as Record<string, unknown>[]).map((row) => ({
        errorCode: String(row.error_code),
        count: Number(row.cnt),
        lastSeenAt: new Date(row.last_seen_at as Date | string).toISOString(),
        sampleConversationId: row.sample_conversation_id
          ? String(row.sample_conversation_id)
          : null,
        sampleFlowExecutionId: row.sample_flow_execution_id
          ? String(row.sample_flow_execution_id)
          : null,
      })),
    };
  },

  async getErrorDetail(errorCode: string) {
    const pool = getPool();
    const result = await pool
      .request()
      .input("errorCode", sql.NVarChar(80), errorCode)
      .query(`
        SELECT TOP 20
          e.id AS flow_execution_id,
          e.conversation_id,
          e.source_message_id AS message_id,
          e.result_code,
          e.error_message,
          e.started_at
        FROM whatsapp_flow_executions e
        WHERE e.error_code = @errorCode OR e.result_code = @errorCode
        ORDER BY e.started_at DESC
      `);

    const samples = (result.recordset as Record<string, unknown>[]).map((row) => ({
      flowExecutionId: row.flow_execution_id ? String(row.flow_execution_id) : null,
      conversationId: row.conversation_id ? String(row.conversation_id) : null,
      messageId: row.message_id ? String(row.message_id) : null,
      resultCode: row.result_code ? String(row.result_code) : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      occurredAt: new Date(row.started_at as Date | string).toISOString(),
    }));

    return {
      errorCode,
      count: samples.length,
      lastSeenAt: samples[0]?.occurredAt ?? new Date(0).toISOString(),
      samples,
    };
  },

  async getNotificationDetail(notificationId: string) {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, notificationId)
      .query(`
        SELECT TOP 1
          n.*,
          emp.phone_number AS employee_phone_number,
          e.id AS flow_execution_id
        FROM whatsapp_attendance_notifications n
        INNER JOIN employees emp ON emp.id = n.employee_id
        LEFT JOIN whatsapp_flow_executions e ON e.notification_id = n.id
        WHERE n.id = @id
        ORDER BY e.started_at DESC
      `);
    if (!result.recordset[0]) {
      return null;
    }
    const row = result.recordset[0] as Record<string, unknown>;
    const phone = String(row.employee_phone_number ?? "");
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      employeeId: String(row.employee_id),
      operationWorkdayId: row.operation_workday_id ? String(row.operation_workday_id) : null,
      attendanceRecordId: row.attendance_record_id ? String(row.attendance_record_id) : null,
      phoneNumber: maskPhoneForObservability(phone),
      phoneMasked: maskPhoneForObservability(phone),
      templateSid: row.template_sid ? String(row.template_sid) : null,
      templateName: row.template_name ? String(row.template_name) : null,
      status: String(row.status),
      twilioMessageSid: row.twilio_message_sid ? String(row.twilio_message_sid) : null,
      attemptCount: Number(row.attempt_count ?? 0),
      lastAttemptAt: row.last_attempt_at
        ? new Date(row.last_attempt_at as Date | string).toISOString()
        : null,
      sentAt: row.sent_at ? new Date(row.sent_at as Date | string).toISOString() : null,
      errorCode: row.error_code ? String(row.error_code) : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      correlationId: row.correlation_id ? String(row.correlation_id) : null,
      flowExecutionId: row.flow_execution_id ? String(row.flow_execution_id) : null,
      createdAt: new Date(row.created_at as Date | string).toISOString(),
      updatedAt: new Date((row.updated_at as Date | string) ?? row.created_at).toISOString(),
    };
  },

  async cleanupObservabilityBatches(input: {
    messageRetentionDays: number;
    flowRetentionDays: number;
    candidateRetentionDays: number;
    providerEventRetentionDays: number;
    batchSize: number;
  }): Promise<Record<string, number>> {
    const pool = getPool();
    const metrics: Record<string, number> = {
      candidatesDeleted: 0,
      stepsDeleted: 0,
      providerEventsDeleted: 0,
      executionsDeleted: 0,
    };

    const deleteCandidates = await pool
      .request()
      .input("days", sql.Int, input.candidateRetentionDays)
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        DELETE TOP (@batchSize) c
        FROM whatsapp_flow_candidates c
        INNER JOIN whatsapp_flow_executions e ON e.id = c.flow_execution_id
        WHERE e.started_at < DATEADD(DAY, -@days, SYSUTCDATETIME())
      `);
    metrics.candidatesDeleted = deleteCandidates.rowsAffected[0] ?? 0;

    const deleteSteps = await pool
      .request()
      .input("days", sql.Int, input.flowRetentionDays)
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        DELETE TOP (@batchSize) s
        FROM whatsapp_flow_steps s
        INNER JOIN whatsapp_flow_executions e ON e.id = s.flow_execution_id
        WHERE e.started_at < DATEADD(DAY, -@days, SYSUTCDATETIME())
      `);
    metrics.stepsDeleted = deleteSteps.rowsAffected[0] ?? 0;

    const deleteProvider = await pool
      .request()
      .input("days", sql.Int, input.providerEventRetentionDays)
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        DELETE TOP (@batchSize)
        FROM whatsapp_provider_events
        WHERE received_at < DATEADD(DAY, -@days, SYSUTCDATETIME())
      `);
    metrics.providerEventsDeleted = deleteProvider.rowsAffected[0] ?? 0;

    const deleteExecutions = await pool
      .request()
      .input("days", sql.Int, input.flowRetentionDays)
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        DELETE TOP (@batchSize)
        FROM whatsapp_flow_executions
        WHERE started_at < DATEADD(DAY, -@days, SYSUTCDATETIME())
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_flow_steps s WHERE s.flow_execution_id = whatsapp_flow_executions.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_flow_candidates c WHERE c.flow_execution_id = whatsapp_flow_executions.id
          )
      `);
    metrics.executionsDeleted = deleteExecutions.rowsAffected[0] ?? 0;

    // Message retention: only clear observability linkage columns / provider timestamps older than policy.
    // Do not delete functional whatsapp_messages rows.
    await pool
      .request()
      .input("days", sql.Int, input.messageRetentionDays)
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        UPDATE TOP (@batchSize) whatsapp_messages
        SET template_variables_json = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE created_at < DATEADD(DAY, -@days, SYSUTCDATETIME())
          AND template_variables_json IS NOT NULL
      `);

    return metrics;
  },
};
