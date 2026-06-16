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
  async findByMessageSid(messageSid: string): Promise<WhatsAppMessage | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("messageSid", sql.NVarChar(100), messageSid)
      .query("SELECT TOP 1 * FROM whatsapp_messages WHERE message_sid = @messageSid");

    if (!result.recordset[0]) {
      return null;
    }

    return mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
  },

  async create(input: {
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
  }): Promise<WhatsAppMessage> {
    const pool = getPool();

    try {
      const result = await pool
        .request()
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
        .query(`
          INSERT INTO whatsapp_messages (
            message_sid, direction, employee_id, phone_from, phone_to,
            message_type, body, latitude, longitude, status, raw_payload
          )
          OUTPUT INSERTED.*
          VALUES (
            @messageSid, @direction, @employeeId, @phoneFrom, @phoneTo,
            @messageType, @body, @latitude, @longitude, @status, @rawPayload
          )
        `);

      return mapWhatsAppMessageRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (
        input.messageSid &&
        error instanceof Error &&
        error.message.includes("UQ_whatsapp_messages_message_sid")
      ) {
        const existing = await this.findByMessageSid(input.messageSid);
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  },

  async updateProcessingStatus(
    messageSid: string,
    input: {
      processingStatus: import("../types/twilio.types").WhatsAppMessageProcessingStatus;
      processingErrorCode?: string | null;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("messageSid", sql.NVarChar(100), messageSid)
      .input("processingStatus", sql.NVarChar(30), input.processingStatus)
      .input("processingErrorCode", sql.NVarChar(100), input.processingErrorCode ?? null)
      .query(`
        UPDATE whatsapp_messages
        SET processing_status = @processingStatus,
            processing_error_code = @processingErrorCode,
            processed_at = SYSUTCDATETIME()
        WHERE message_sid = @messageSid
      `);
  },
};
