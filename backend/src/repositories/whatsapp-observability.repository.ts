import sql from "mssql";
import { getPool } from "../database/connection";
import { mapWhatsAppMessageRow } from "../utils/row-mappers";
import type { WhatsAppMessage } from "../types/twilio.types";
import type { WhatsappConversation } from "../types/whatsapp-observability";
import {
  applyWhatsappConversationListFilters,
  type ConversationListFilterCriteria,
} from "../utils/whatsapp-observability-conversation-filters";
import { whatsappConversationRepository } from "./whatsapp-conversation.repository";
import { whatsappFlowExecutionRepository } from "./whatsapp-flow-execution.repository";
import { whatsappMessageRepository } from "./whatsapp-message.repository";
import { whatsappProviderEventRepository } from "./whatsapp-provider-event.repository";
import { maskPhoneForObservability } from "../utils/whatsapp-observability";

export interface ConversationListFilters extends ConversationListFilterCriteria {
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

    const countRequest = pool.request();
    const whereSql = applyWhatsappConversationListFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(1) AS total
      FROM whatsapp_conversations c
      ${whereSql || "WHERE 1=1"}
    `);
    const total = Number((countResult.recordset[0] as { total: number }).total ?? 0);

    const listRequest = pool.request();
    applyWhatsappConversationListFilters(listRequest, filters);
    listRequest.input("offset", sql.Int, offset);
    listRequest.input("limit", sql.Int, filters.limit);

    const listResult = await listRequest.query(`
      SELECT c.*
      FROM whatsapp_conversations c
      ${whereSql || "WHERE 1=1"}
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
    const message = await whatsappMessageRepository.findByIdGlobal(messageId);
    if (!message) {
      return null;
    }
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

  /**
   * Platform-wide employee lookup for observability filters.
   * Must match the conversation list universe (cross-company).
   */
  async listEmployeeLookups(query: {
    search?: string;
    limit?: number;
    id?: string;
    ids?: string[];
    active?: boolean;
  }): Promise<Array<{ id: string; fullName: string; companyId: string; companyName: string }>> {
    const pool = getPool();
    const request = pool.request().input("limit", sql.Int, query.limit ?? 20);
    const filters = ["1=1"];
    const ids = query.ids ?? (query.id ? [query.id] : []);

    if (ids.length === 1) {
      request.input("id", sql.UniqueIdentifier, ids[0]);
      filters.push("e.id = @id");
    } else if (ids.length > 1) {
      const placeholders = ids.map((id, index) => {
        const param = `id${index}`;
        request.input(param, sql.UniqueIdentifier, id);
        return `@${param}`;
      });
      filters.push(`e.id IN (${placeholders.join(", ")})`);
    }

    if (query.search) {
      request.input("search", sql.NVarChar(150), `%${query.search}%`);
      filters.push("(e.name LIKE @search OR c.name LIKE @search)");
    }

    if (query.active === true) {
      filters.push("e.active = 1");
    }

    const result = await request.query(`
      SELECT TOP (@limit)
        e.id,
        e.name AS full_name,
        e.company_id,
        c.name AS company_name
      FROM employees e
      INNER JOIN companies c ON c.id = e.company_id
      WHERE ${filters.join(" AND ")}
      ORDER BY e.name ASC, c.name ASC
    `);

    return result.recordset.map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      companyId: String(row.company_id),
      companyName: String(row.company_name),
    }));
  },
};
