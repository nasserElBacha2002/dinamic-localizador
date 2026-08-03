import sql from "mssql";
import { getPool } from "../database/connection";
import type { WhatsappProviderEvent } from "../types/whatsapp-observability";

const mapEvent = (row: Record<string, unknown>): WhatsappProviderEvent => ({
  id: String(row.id),
  messageId: row.message_id ? String(row.message_id) : null,
  provider: String(row.provider),
  providerMessageSid: String(row.provider_message_sid),
  eventType: String(row.event_type),
  providerStatus: String(row.provider_status),
  providerEventKey: String(row.provider_event_key),
  errorCode: row.error_code ? String(row.error_code) : null,
  errorMessage: row.error_message ? String(row.error_message) : null,
  payloadJsonSanitized: row.payload_json_sanitized
    ? String(row.payload_json_sanitized)
    : null,
  providerCreatedAt: row.provider_created_at
    ? new Date(row.provider_created_at as Date | string).toISOString()
    : null,
  receivedAt: new Date(row.received_at as Date | string).toISOString(),
  createdAt: new Date(row.created_at as Date | string).toISOString(),
});

export const whatsappProviderEventRepository = {
  async insertIdempotent(input: {
    messageId?: string | null;
    provider?: string;
    providerMessageSid: string;
    eventType?: string;
    providerStatus: string;
    providerEventKey: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    payloadJsonSanitized?: string | null;
    providerCreatedAt?: Date | string | null;
  }): Promise<{ created: boolean; event: WhatsappProviderEvent | null }> {
    const pool = getPool();
    try {
      const result = await pool
        .request()
        .input("messageId", sql.UniqueIdentifier, input.messageId ?? null)
        .input("provider", sql.NVarChar(30), input.provider ?? "twilio")
        .input("providerMessageSid", sql.NVarChar(64), input.providerMessageSid)
        .input("eventType", sql.NVarChar(40), input.eventType ?? "STATUS")
        .input("providerStatus", sql.NVarChar(40), input.providerStatus)
        .input("providerEventKey", sql.NVarChar(128), input.providerEventKey)
        .input("errorCode", sql.NVarChar(40), input.errorCode ?? null)
        .input("errorMessage", sql.NVarChar(500), input.errorMessage ?? null)
        .input("payloadJsonSanitized", sql.NVarChar(sql.MAX), input.payloadJsonSanitized ?? null)
        .input(
          "providerCreatedAt",
          sql.DateTime2,
          input.providerCreatedAt ? new Date(input.providerCreatedAt) : null,
        )
        .query(`
          INSERT INTO whatsapp_provider_events (
            message_id, provider, provider_message_sid, event_type, provider_status,
            provider_event_key, error_code, error_message, payload_json_sanitized,
            provider_created_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @messageId, @provider, @providerMessageSid, @eventType, @providerStatus,
            @providerEventKey, @errorCode, @errorMessage, @payloadJsonSanitized,
            @providerCreatedAt
          )
        `);

      return {
        created: true,
        event: mapEvent(result.recordset[0] as Record<string, unknown>),
      };
    } catch (error) {
      const number = (error as { number?: number }).number;
      if (number === 2627 || number === 2601) {
        const existing = await pool
          .request()
          .input("providerEventKey", sql.NVarChar(128), input.providerEventKey)
          .query(`
            SELECT TOP 1 *
            FROM whatsapp_provider_events
            WHERE provider_event_key = @providerEventKey
          `);
        return {
          created: false,
          event: existing.recordset[0]
            ? mapEvent(existing.recordset[0] as Record<string, unknown>)
            : null,
        };
      }
      throw error;
    }
  },

  async listByMessageSid(providerMessageSid: string): Promise<WhatsappProviderEvent[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("providerMessageSid", sql.NVarChar(64), providerMessageSid)
      .query(`
        SELECT *
        FROM whatsapp_provider_events
        WHERE provider_message_sid = @providerMessageSid
        ORDER BY received_at ASC, created_at ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapEvent);
  },

  async listByMessageId(messageId: string): Promise<WhatsappProviderEvent[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("messageId", sql.UniqueIdentifier, messageId)
      .query(`
        SELECT *
        FROM whatsapp_provider_events
        WHERE message_id = @messageId
        ORDER BY received_at ASC, created_at ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapEvent);
  },

  async linkOrphanedToMessage(
    providerMessageSid: string,
    messageId: string,
  ): Promise<number> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("providerMessageSid", sql.NVarChar(100), providerMessageSid)
      .input("messageId", sql.UniqueIdentifier, messageId)
      .query(`
        UPDATE whatsapp_provider_events
        SET message_id = @messageId
        WHERE provider_message_sid = @providerMessageSid
          AND message_id IS NULL
      `);
    return result.rowsAffected[0] ?? 0;
  },

  async listByConversation(conversationId: string): Promise<WhatsappProviderEvent[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("conversationId", sql.UniqueIdentifier, conversationId)
      .query(`
        SELECT pe.*
        FROM whatsapp_provider_events pe
        INNER JOIN whatsapp_messages m ON m.id = pe.message_id
        WHERE m.conversation_id = @conversationId
        ORDER BY pe.received_at ASC, pe.created_at ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapEvent);
  },
};
