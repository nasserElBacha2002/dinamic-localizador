import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  WhatsAppMessage,
  WhatsAppMessageDirection,
  WhatsAppMessageType,
} from "../types/twilio.types";
import { mapWhatsAppMessageRow } from "../utils/row-mappers";

const sanitizePayload = (payload: Record<string, string>): string => {
  const safe = { ...payload };
  delete safe.AccountSid;
  return JSON.stringify(safe);
};

export const whatsappMessageRepository = {
  async findByMessageSid(companyId: string, messageSid: string): Promise<WhatsAppMessage | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), messageSid)
      .query(`
        SELECT TOP 1 * FROM whatsapp_messages
        WHERE message_sid = @messageSid AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
  },

  async create(input: {
    companyId: string;
    messageSid: string | null;
    direction: WhatsAppMessageDirection;
    employeeId: string | null;
    phoneFrom: string;
    phoneTo: string;
    messageType: WhatsAppMessageType;
    body: string | null;
    latitude: number | null;
    longitude: number | null;
    status?: string | null;
    rawPayload?: Record<string, string> | null;
    notificationId?: string | null;
  }): Promise<WhatsAppMessage> {
    const pool = getPool();

    try {
      const request = pool
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("messageSid", sql.NVarChar(100), input.messageSid)
        .input("direction", sql.NVarChar(20), input.direction)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("phoneFrom", sql.NVarChar(30), input.phoneFrom)
        .input("phoneTo", sql.NVarChar(30), input.phoneTo)
        .input("messageType", sql.NVarChar(30), input.messageType)
        .input("body", sql.NVarChar(sql.MAX), input.body)
        .input("latitude", sql.Decimal(10, 7), input.latitude)
        .input("longitude", sql.Decimal(10, 7), input.longitude)
        .input("status", sql.NVarChar(30), input.status ?? null)
        .input(
          "rawPayload",
          sql.NVarChar(sql.MAX),
          input.rawPayload ? sanitizePayload(input.rawPayload) : null,
        )
        .input("notificationId", sql.UniqueIdentifier, input.notificationId ?? null);

      const result = await request.query(`
          INSERT INTO whatsapp_messages (
            company_id, message_sid, direction, employee_id, phone_from, phone_to,
            message_type, body, latitude, longitude, status, raw_payload, notification_id
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @messageSid, @direction, @employeeId, @phoneFrom, @phoneTo,
            @messageType, @body, @latitude, @longitude, @status, @rawPayload, @notificationId
          )
        `);

      return mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (
        input.messageSid &&
        error instanceof Error &&
        error.message.includes("UQ_whatsapp_messages_message_sid")
      ) {
        const existing = await this.findByMessageSid(input.companyId, input.messageSid);
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  },

  async updateProcessingStatus(
    companyId: string,
    messageSid: string,
    input: {
      processingStatus: import("../types/twilio.types").WhatsAppMessageProcessingStatus;
      processingErrorCode?: string | null;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), messageSid)
      .input("processingStatus", sql.NVarChar(30), input.processingStatus)
      .input("processingErrorCode", sql.NVarChar(100), input.processingErrorCode ?? null)
      .query(`
        UPDATE whatsapp_messages
        SET processing_status = @processingStatus,
            processing_error_code = @processingErrorCode,
            processed_at = SYSUTCDATETIME()
        WHERE message_sid = @messageSid AND company_id = @companyId
      `);
  },

  async findById(companyId: string, id: string): Promise<WhatsAppMessage | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(
        `SELECT TOP 1 * FROM whatsapp_messages WHERE id = @id AND company_id = @companyId`,
      );
    if (!result.recordset[0]) {
      return null;
    }
    return mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
  },

  /** Global UUID lookup for Twilio SID correlation before tenant is known. */
  async findByIdGlobal(id: string): Promise<WhatsAppMessage | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM whatsapp_messages WHERE id = @id`);
    if (!result.recordset[0]) {
      return null;
    }
    return mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByProviderMessageSid(providerMessageSid: string): Promise<WhatsAppMessage | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("providerMessageSid", sql.NVarChar(100), providerMessageSid)
      .query(`
        SELECT TOP 1 *
        FROM whatsapp_messages
        WHERE provider_message_sid = @providerMessageSid
           OR message_sid = @providerMessageSid
        ORDER BY created_at DESC
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateObservabilityFields(
    companyId: string,
    messageId: string,
    input: {
      conversationId?: string | null;
      correlationId?: string | null;
      causationId?: string | null;
      provider?: string | null;
      providerMessageSid?: string | null;
      templateSid?: string | null;
      templateName?: string | null;
      templateVariablesJson?: string | null;
      providerStatus?: string | null;
      notificationId?: string | null;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, messageId)
      .input("conversationId", sql.UniqueIdentifier, input.conversationId ?? null)
      .input("correlationId", sql.UniqueIdentifier, input.correlationId ?? null)
      .input("causationId", sql.UniqueIdentifier, input.causationId ?? null)
      .input("provider", sql.NVarChar(20), input.provider ?? null)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid ?? null)
      .input("templateSid", sql.NVarChar(64), input.templateSid ?? null)
      .input("templateName", sql.NVarChar(80), input.templateName ?? null)
      .input("templateVariablesJson", sql.NVarChar(2000), input.templateVariablesJson ?? null)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus ?? null)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId ?? null)
      .query(`
        UPDATE whatsapp_messages
        SET conversation_id = COALESCE(@conversationId, conversation_id),
            correlation_id = COALESCE(@correlationId, correlation_id),
            causation_id = COALESCE(@causationId, causation_id),
            provider = COALESCE(@provider, provider),
            provider_message_sid = COALESCE(@providerMessageSid, provider_message_sid),
            template_sid = COALESCE(@templateSid, template_sid),
            template_name = COALESCE(@templateName, template_name),
            template_variables_json = COALESCE(@templateVariablesJson, template_variables_json),
            provider_status = COALESCE(@providerStatus, provider_status),
            notification_id = COALESCE(@notificationId, notification_id),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async updateProviderStatus(
    companyId: string,
    messageId: string,
    input: {
      providerStatus: string;
      providerErrorCode?: string | null;
      providerErrorMessage?: string | null;
      statusTimestamp: Date;
      statusKey: string;
    },
  ): Promise<void> {
    const pool = getPool();
    const status = input.statusKey.toLowerCase();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, messageId)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus)
      .input("providerErrorCode", sql.NVarChar(40), input.providerErrorCode ?? null)
      .input("providerErrorMessage", sql.NVarChar(1000), input.providerErrorMessage ?? null)
      .input("statusTimestamp", sql.DateTime2, input.statusTimestamp)
      .input("isSent", sql.Bit, status === "sent" || status === "delivered" || status === "read" ? 1 : 0)
      .input("isDelivered", sql.Bit, status === "delivered" || status === "read" ? 1 : 0)
      .input("isRead", sql.Bit, status === "read" ? 1 : 0)
      .input(
        "isFailed",
        sql.Bit,
        status === "failed" || status === "undelivered" || status === "canceled" ? 1 : 0,
      )
      .query(`
        UPDATE whatsapp_messages
        SET provider_status = @providerStatus,
            provider_error_code = COALESCE(@providerErrorCode, provider_error_code),
            provider_error_message = COALESCE(@providerErrorMessage, provider_error_message),
            sent_at = CASE WHEN @isSent = 1 THEN COALESCE(sent_at, @statusTimestamp) ELSE sent_at END,
            delivered_at = CASE WHEN @isDelivered = 1 THEN COALESCE(delivered_at, @statusTimestamp) ELSE delivered_at END,
            read_at = CASE WHEN @isRead = 1 THEN COALESCE(read_at, @statusTimestamp) ELSE read_at END,
            failed_at = CASE WHEN @isFailed = 1 THEN COALESCE(failed_at, @statusTimestamp) ELSE failed_at END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },
};
