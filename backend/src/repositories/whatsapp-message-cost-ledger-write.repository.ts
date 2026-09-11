import sql from "mssql";
import { getPool } from "../database/connection";
import { monotonicProviderStatusAdvanceSql } from "../utils/whatsapp-observability";
import {
  mapLedgerRow,
  type InsertCostLedgerInput,
  type WhatsappMessageCostLedgerRow,
} from "./whatsapp-message-cost-ledger.types";

export const whatsappMessageCostLedgerWriteRepository = {
  async insertIgnoreDuplicate(input: InsertCostLedgerInput): Promise<string | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("companyNameSnapshot", sql.NVarChar(200), input.companyNameSnapshot ?? null)
      .input("whatsappMessageId", sql.UniqueIdentifier, input.whatsappMessageId ?? null)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("direction", sql.NVarChar(10), input.direction)
      .input("sentAt", sql.DateTime2, input.sentAt)
      .input("recipientPhoneMasked", sql.NVarChar(40), input.recipientPhoneMasked)
      .input("messageKind", sql.NVarChar(40), input.messageKind)
      .input("templateSid", sql.NVarChar(100), input.templateSid ?? null)
      .input("templateName", sql.NVarChar(120), input.templateName ?? null)
      .input("flowLabel", sql.NVarChar(60), input.flowLabel ?? null)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus ?? null)
      .input("providerStatusAt", sql.DateTime2, input.providerStatusAt ?? null)
      .input("costQuality", sql.NVarChar(20), input.costQuality)
      .input("costSource", sql.NVarChar(40), input.costSource)
      .input("nextSyncAt", sql.DateTime2, input.nextSyncAt ?? null)
      .input("lastSyncErrorCode", sql.NVarChar(80), input.lastSyncErrorCode ?? null)
      .input("lastSyncErrorMessage", sql.NVarChar(500), input.lastSyncErrorMessage ?? null)
      .query(`
        IF @providerMessageSid IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM dbo.whatsapp_message_cost_ledger
             WHERE provider_message_sid = @providerMessageSid
           )
        BEGIN
          SELECT CAST(NULL AS UNIQUEIDENTIFIER) AS id;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.whatsapp_message_cost_ledger (
            company_id,
            company_name_snapshot,
            whatsapp_message_id,
            provider_message_sid,
            direction,
            sent_at,
            recipient_phone_masked,
            message_kind,
            template_sid,
            template_name,
            flow_label,
            provider_status,
            provider_status_at,
            cost_quality,
            cost_source,
            next_sync_at,
            last_sync_error_code,
            last_sync_error_message
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId,
            COALESCE(
              @companyNameSnapshot,
              (SELECT TOP (1) LEFT(name, 200) FROM dbo.companies WHERE id = @companyId)
            ),
            @whatsappMessageId,
            @providerMessageSid,
            @direction,
            @sentAt,
            @recipientPhoneMasked,
            @messageKind,
            @templateSid,
            @templateName,
            @flowLabel,
            @providerStatus,
            @providerStatusAt,
            @costQuality,
            @costSource,
            @nextSyncAt,
            @lastSyncErrorCode,
            @lastSyncErrorMessage
          );
        END;
      `);

    const id = result.recordset[0]?.id;
    return id ? String(id) : null;
  },

  async markConfirmed(input: {
    id: string;
    leaseOwner: string;
    priceAmount: string;
    currency: string;
    providerStatus: string | null;
    pricingCategory?: string | null;
  }): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("priceAmount", sql.Decimal(18, 6), input.priceAmount)
      .input("currency", sql.Char(3), input.currency)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus)
      .input("pricingCategory", sql.NVarChar(40), input.pricingCategory ?? null)
      .query(`
        UPDATE dbo.whatsapp_message_cost_ledger
        SET price_amount = @priceAmount,
            currency = @currency,
            provider_status = COALESCE(@providerStatus, provider_status),
            provider_status_at = CASE
              WHEN @providerStatus IS NOT NULL THEN SYSUTCDATETIME()
              ELSE provider_status_at
            END,
            pricing_category = COALESCE(@pricingCategory, pricing_category),
            cost_quality = N'CONFIRMED',
            cost_source = N'TWILIO_MESSAGE_RESOURCE',
            last_synced_at = SYSUTCDATETIME(),
            next_sync_at = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_sync_error_code = NULL,
            last_sync_error_message = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND lease_owner = @leaseOwner
          AND cost_quality = N'PENDING'
          AND (lease_expires_at IS NULL OR lease_expires_at >= SYSUTCDATETIME());
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async markEstimated(input: {
    id: string;
    leaseOwner: string;
    priceAmount: string;
    currency: string;
    tariffId: string;
    providerStatus?: string | null;
  }): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("priceAmount", sql.Decimal(18, 6), input.priceAmount)
      .input("currency", sql.Char(3), input.currency)
      .input("tariffId", sql.UniqueIdentifier, input.tariffId)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus ?? null)
      .query(`
        UPDATE dbo.whatsapp_message_cost_ledger
        SET price_amount = @priceAmount,
            currency = @currency,
            tariff_id = @tariffId,
            provider_status = COALESCE(@providerStatus, provider_status),
            cost_quality = N'ESTIMATED',
            cost_source = N'TARIFF_TABLE',
            last_synced_at = SYSUTCDATETIME(),
            next_sync_at = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_sync_error_code = NULL,
            last_sync_error_message = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND lease_owner = @leaseOwner
          AND cost_quality = N'PENDING'
          AND (lease_expires_at IS NULL OR lease_expires_at >= SYSUTCDATETIME());
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async markPendingRetry(input: {
    id: string;
    leaseOwner: string;
    nextSyncAt: Date;
    errorCode: string;
    errorMessage: string;
    providerStatus?: string | null;
  }): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("nextSyncAt", sql.DateTime2, input.nextSyncAt)
      .input("errorCode", sql.NVarChar(80), input.errorCode)
      .input("errorMessage", sql.NVarChar(500), input.errorMessage.slice(0, 500))
      .input("providerStatus", sql.NVarChar(40), input.providerStatus ?? null)
      .query(`
        UPDATE dbo.whatsapp_message_cost_ledger
        SET next_sync_at = @nextSyncAt,
            provider_status = COALESCE(@providerStatus, provider_status),
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_sync_error_code = @errorCode,
            last_sync_error_message = @errorMessage,
            last_synced_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND lease_owner = @leaseOwner
          AND cost_quality = N'PENDING'
          AND (lease_expires_at IS NULL OR lease_expires_at >= SYSUTCDATETIME());
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async markUnavailable(input: {
    id: string;
    leaseOwner: string;
    errorCode: string;
    errorMessage: string;
    providerStatus?: string | null;
  }): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("errorCode", sql.NVarChar(80), input.errorCode)
      .input("errorMessage", sql.NVarChar(500), input.errorMessage.slice(0, 500))
      .input("providerStatus", sql.NVarChar(40), input.providerStatus ?? null)
      .query(`
        UPDATE dbo.whatsapp_message_cost_ledger
        SET cost_quality = N'UNAVAILABLE',
            cost_source = N'NONE',
            provider_status = COALESCE(@providerStatus, provider_status),
            next_sync_at = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_sync_error_code = @errorCode,
            last_sync_error_message = @errorMessage,
            last_synced_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND lease_owner = @leaseOwner
          AND cost_quality IN (N'PENDING', N'UNAVAILABLE')
          AND (lease_expires_at IS NULL OR lease_expires_at >= SYSUTCDATETIME());
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  /**
   * Monotonic provider_status update. Safe for duplicate / out-of-order callbacks.
   * If no ledger row exists yet, returns false (reconcile will create later).
   */
  async updateProviderStatusBySid(input: {
    providerMessageSid: string;
    providerStatus: string;
    providerStatusAt?: Date | null;
  }): Promise<boolean> {
    const pool = getPool();
    const advance = monotonicProviderStatusAdvanceSql("provider_status", "@providerStatus");
    const result = await pool
      .request()
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus.toLowerCase())
      .input("providerStatusAt", sql.DateTime2, input.providerStatusAt ?? new Date())
      .query(`
        UPDATE dbo.whatsapp_message_cost_ledger
        SET provider_status = @providerStatus,
            provider_status_at = @providerStatusAt,
            updated_at = SYSUTCDATETIME()
        WHERE provider_message_sid = @providerMessageSid
          AND ${advance};
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async getById(id: string): Promise<WhatsappMessageCostLedgerRow | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT * FROM dbo.whatsapp_message_cost_ledger WHERE id = @id`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapLedgerRow(row) : null;
  },
};
