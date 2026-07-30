import { createHash } from "node:crypto";
import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";

export type WhatsappWebhookEventType = "INBOUND_MESSAGE" | "STATUS_CALLBACK";

export type WhatsappWebhookProcessingStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "PROCESSED"
  | "DUPLICATE"
  | "FAILED"
  | "ANOMALY";

export type WhatsappWebhookEvent = {
  id: string;
  companyId: string;
  messageSid: string;
  eventType: WhatsappWebhookEventType;
  payloadHash: string;
  processingStatus: WhatsappWebhookProcessingStatus;
  responseReference: string | null;
  processedAt: string | null;
  attemptCount: number;
  lastError: string | null;
};

export type ClaimWebhookEventResult =
  | { outcome: "CLAIMED"; event: WhatsappWebhookEvent }
  | { outcome: "IDEMPOTENT_REPLAY"; event: WhatsappWebhookEvent }
  | { outcome: "PAYLOAD_ANOMALY"; event: WhatsappWebhookEvent };

const mapRow = (row: Record<string, unknown>): WhatsappWebhookEvent => ({
  id: String(row.id),
  companyId: String(row.company_id),
  messageSid: String(row.message_sid),
  eventType: String(row.event_type) as WhatsappWebhookEventType,
  payloadHash: String(row.payload_hash),
  processingStatus: String(row.processing_status) as WhatsappWebhookProcessingStatus,
  responseReference: row.response_reference ? String(row.response_reference) : null,
  processedAt: row.processed_at ? String(row.processed_at) : null,
  attemptCount: Number(row.attempt_count ?? 0),
  lastError: row.last_error ? String(row.last_error) : null,
});

export const hashWebhookPayload = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export const whatsappWebhookEventRepository = {
  async claimInboundMessage(input: {
    companyId: string;
    messageSid: string;
    payloadHash: string;
  }): Promise<ClaimWebhookEventResult> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const existing = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("messageSid", sql.NVarChar(100), input.messageSid)
        .input("eventType", sql.NVarChar(40), "INBOUND_MESSAGE")
        .query(`
          SELECT TOP 1 *
          FROM whatsapp_webhook_events WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND message_sid = @messageSid
            AND event_type = @eventType
        `);

      const row = existing.recordset[0] as Record<string, unknown> | undefined;
      if (row) {
        const event = mapRow(row);
        if (event.payloadHash !== input.payloadHash) {
          await new sql.Request(transaction)
            .input("id", sql.UniqueIdentifier, event.id)
            .query(`
              UPDATE whatsapp_webhook_events
              SET processing_status = N'ANOMALY',
                  last_error = N'PAYLOAD_HASH_MISMATCH',
                  updated_at = SYSUTCDATETIME()
              WHERE id = @id
            `);
          await transaction.commit();
          return { outcome: "PAYLOAD_ANOMALY", event: { ...event, processingStatus: "ANOMALY" } };
        }
        await transaction.commit();
        return { outcome: "IDEMPOTENT_REPLAY", event };
      }

      const inserted = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("messageSid", sql.NVarChar(100), input.messageSid)
        .input("eventType", sql.NVarChar(40), "INBOUND_MESSAGE")
        .input("payloadHash", sql.NVarChar(64), input.payloadHash)
        .query(`
          INSERT INTO whatsapp_webhook_events (
            company_id, message_sid, event_type, payload_hash, processing_status, attempt_count
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @messageSid, @eventType, @payloadHash, N'PROCESSING', 1
          )
        `);
      await transaction.commit();
      return {
        outcome: "CLAIMED",
        event: mapRow(inserted.recordset[0] as Record<string, unknown>),
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async markProcessed(input: {
    companyId: string;
    eventId: string;
    responseReference?: string | null;
  }): Promise<void> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("eventId", sql.UniqueIdentifier, input.eventId)
      .input("responseReference", sql.NVarChar(200), input.responseReference ?? null)
      .query(`
        UPDATE whatsapp_webhook_events
        SET processing_status = N'PROCESSED',
            response_reference = @responseReference,
            processed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @eventId AND company_id = @companyId
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new AppError(409, "WEBHOOK_EVENT_NOT_FOUND", "Evento de webhook no encontrado");
    }
  },

  async markFailed(input: {
    companyId: string;
    eventId: string;
    error: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("eventId", sql.UniqueIdentifier, input.eventId)
      .input("error", sql.NVarChar(1000), input.error.slice(0, 1000))
      .query(`
        UPDATE whatsapp_webhook_events
        SET processing_status = N'FAILED',
            last_error = @error,
            attempt_count = attempt_count + 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @eventId AND company_id = @companyId
      `);
  },
};
