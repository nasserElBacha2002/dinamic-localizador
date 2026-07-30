import { createHash } from "node:crypto";
import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { rollbackTransactionSafely } from "../utils/sql-transaction";

export type WhatsappWebhookEventType = "INBOUND_MESSAGE" | "STATUS_CALLBACK";

export type WhatsappWebhookProcessingStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "PROCESSED"
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
  responseBody: string | null;
  responseType: string | null;
  processedAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  processingOwner: string | null;
  processingExpiresAt: string | null;
  processingVersion: number;
  nextAttemptAt: string | null;
  lastError: string | null;
};

export type ClaimWebhookEventResult =
  | { outcome: "CLAIMED"; event: WhatsappWebhookEvent }
  | { outcome: "IDEMPOTENT_REPLAY"; event: WhatsappWebhookEvent }
  | { outcome: "IN_PROGRESS"; event: WhatsappWebhookEvent }
  | { outcome: "PAYLOAD_ANOMALY"; event: WhatsappWebhookEvent }
  | { outcome: "EXHAUSTED"; event: WhatsappWebhookEvent };

const mapRow = (row: Record<string, unknown>): WhatsappWebhookEvent => ({
  id: String(row.id),
  companyId: String(row.company_id),
  messageSid: String(row.message_sid),
  eventType: String(row.event_type) as WhatsappWebhookEventType,
  payloadHash: String(row.payload_hash),
  processingStatus: String(row.processing_status) as WhatsappWebhookProcessingStatus,
  responseReference: row.response_reference ? String(row.response_reference) : null,
  responseBody: row.response_body ? String(row.response_body) : null,
  responseType: row.response_type ? String(row.response_type) : null,
  processedAt: row.processed_at ? String(row.processed_at) : null,
  attemptCount: Number(row.attempt_count ?? 0),
  maxAttempts: Number(row.max_attempts ?? 8),
  processingOwner: row.processing_owner ? String(row.processing_owner) : null,
  processingExpiresAt: row.processing_expires_at ? String(row.processing_expires_at) : null,
  processingVersion: Number(row.processing_version ?? 0),
  nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : null,
  lastError: row.last_error ? String(row.last_error) : null,
});

/** Canonical payload hash including media URLs/types (sorted keys). */
export const hashWebhookPayload = (payload: Record<string, unknown>): string => {
  const canonical: Record<string, unknown> = {};
  const keys = Object.keys(payload).sort();
  for (const key of keys) {
    if (
      key === "MessageSid" ||
      key === "From" ||
      key === "To" ||
      key === "Body" ||
      key === "Latitude" ||
      key === "Longitude" ||
      key === "NumMedia" ||
      /^MediaUrl\d+$/i.test(key) ||
      /^MediaContentType\d+$/i.test(key)
    ) {
      canonical[key] = payload[key] ?? null;
    }
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
};

const CLAIM_LEASE_SECONDS = 120;

export const whatsappWebhookEventRepository = {
  async claimInboundMessage(input: {
    companyId: string;
    messageSid: string;
    payloadHash: string;
    owner?: string;
  }): Promise<ClaimWebhookEventResult> {
    const owner = input.owner ?? `webhook-${process.pid}`;
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
                  processing_owner = NULL,
                  processing_expires_at = NULL,
                  updated_at = SYSUTCDATETIME()
              WHERE id = @id
            `);
          await transaction.commit();
          return { outcome: "PAYLOAD_ANOMALY", event: { ...event, processingStatus: "ANOMALY" } };
        }

        if (event.processingStatus === "PROCESSED") {
          await transaction.commit();
          return { outcome: "IDEMPOTENT_REPLAY", event };
        }

        if (event.processingStatus === "ANOMALY") {
          await transaction.commit();
          return { outcome: "PAYLOAD_ANOMALY", event };
        }

        if (
          event.processingStatus === "PROCESSING" &&
          event.processingExpiresAt &&
          new Date(event.processingExpiresAt).getTime() > Date.now()
        ) {
          await transaction.commit();
          return { outcome: "IN_PROGRESS", event };
        }

        if (
          event.processingStatus === "FAILED" &&
          event.attemptCount >= event.maxAttempts
        ) {
          await transaction.commit();
          return { outcome: "EXHAUSTED", event };
        }

        if (
          event.nextAttemptAt &&
          new Date(event.nextAttemptAt).getTime() > Date.now() &&
          event.processingStatus === "FAILED"
        ) {
          await transaction.commit();
          return { outcome: "IN_PROGRESS", event };
        }

        // Reclaim expired PROCESSING or retryable FAILED
        const reclaimed = await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, event.id)
          .input("owner", sql.NVarChar(80), owner)
          .input("leaseSeconds", sql.Int, CLAIM_LEASE_SECONDS)
          .input("expectedVersion", sql.BigInt, event.processingVersion)
          .query(`
            UPDATE whatsapp_webhook_events
            SET processing_status = N'PROCESSING',
                processing_owner = @owner,
                processing_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
                processing_version = processing_version + 1,
                attempt_count = attempt_count + 1,
                next_attempt_at = NULL,
                last_error = NULL,
                updated_at = SYSUTCDATETIME()
            OUTPUT INSERTED.*
            WHERE id = @id
              AND processing_version = @expectedVersion
              AND processing_status IN (N'PROCESSING', N'FAILED', N'RECEIVED')
          `);
        await transaction.commit();
        if (!reclaimed.recordset[0]) {
          return { outcome: "IN_PROGRESS", event };
        }
        return {
          outcome: "CLAIMED",
          event: mapRow(reclaimed.recordset[0] as Record<string, unknown>),
        };
      }

      const inserted = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("messageSid", sql.NVarChar(100), input.messageSid)
        .input("eventType", sql.NVarChar(40), "INBOUND_MESSAGE")
        .input("payloadHash", sql.NVarChar(64), input.payloadHash)
        .input("owner", sql.NVarChar(80), owner)
        .input("leaseSeconds", sql.Int, CLAIM_LEASE_SECONDS)
        .query(`
          INSERT INTO whatsapp_webhook_events (
            company_id, message_sid, event_type, payload_hash,
            processing_status, attempt_count, processing_owner,
            processing_expires_at, processing_version
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @messageSid, @eventType, @payloadHash,
            N'PROCESSING', 1, @owner,
            DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()), 1
          )
        `);
      await transaction.commit();
      return {
        outcome: "CLAIMED",
        event: mapRow(inserted.recordset[0] as Record<string, unknown>),
      };
    } catch (error) {
      await rollbackTransactionSafely(
        transaction,
        { operation: "whatsapp-webhook-event.claim", companyId: input.companyId },
        error,
      );
      throw error;
    }
  },

  async markProcessed(input: {
    companyId: string;
    eventId: string;
    processingVersion: number;
    responseBody: string;
    responseType?: string | null;
    responseReference?: string | null;
  }): Promise<void> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("eventId", sql.UniqueIdentifier, input.eventId)
      .input("processingVersion", sql.BigInt, input.processingVersion)
      .input("responseBody", sql.NVarChar(sql.MAX), input.responseBody.slice(0, 4000))
      .input("responseType", sql.NVarChar(40), input.responseType ?? "TwiML")
      .input("responseReference", sql.NVarChar(200), input.responseReference ?? null)
      .query(`
        UPDATE whatsapp_webhook_events
        SET processing_status = N'PROCESSED',
            response_body = @responseBody,
            response_type = @responseType,
            response_reference = @responseReference,
            processed_at = SYSUTCDATETIME(),
            processing_owner = NULL,
            processing_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @eventId
          AND company_id = @companyId
          AND processing_status = N'PROCESSING'
          AND processing_version = @processingVersion
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new AppError(409, "WEBHOOK_CLAIM_LOST", "El claim del webhook ya no es válido");
    }
  },

  async markFailed(input: {
    companyId: string;
    eventId: string;
    processingVersion: number;
    error: string;
    retryDelaySeconds?: number;
  }): Promise<void> {
    const delay = input.retryDelaySeconds ?? 30;
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("eventId", sql.UniqueIdentifier, input.eventId)
      .input("processingVersion", sql.BigInt, input.processingVersion)
      .input("error", sql.NVarChar(1000), input.error.slice(0, 1000))
      .input("delaySeconds", sql.Int, delay)
      .query(`
        UPDATE whatsapp_webhook_events
        SET processing_status = CASE
              WHEN attempt_count >= max_attempts THEN N'FAILED'
              ELSE N'FAILED'
            END,
            last_error = @error,
            processing_owner = NULL,
            processing_expires_at = NULL,
            next_attempt_at = CASE
              WHEN attempt_count >= max_attempts THEN NULL
              ELSE DATEADD(SECOND, @delaySeconds, SYSUTCDATETIME())
            END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @eventId
          AND company_id = @companyId
          AND processing_version = @processingVersion
          AND processing_status = N'PROCESSING'
      `);
  },
};
