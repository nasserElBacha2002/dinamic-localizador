import sql from "mssql";
import { getPool } from "../../database/connection";
import { monotonicProviderStatusAdvanceSql } from "../../utils/whatsapp/whatsapp-observability";
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
      .input("senderPhoneMasked", sql.NVarChar(40), input.senderPhoneMasked ?? null)
      .input("senderBillingKey", sql.NVarChar(64), input.senderBillingKey ?? null)
      .input("metaCswOpen", sql.Bit, input.metaCswOpen == null ? null : input.metaCswOpen ? 1 : 0)
      .input("destinationCountryCode", sql.Char(2), input.destinationCountryCode ?? null)
      .input("metaBillingCategory", sql.NVarChar(40), input.metaBillingCategory ?? null)
      .input("metaCostQuality", sql.NVarChar(20), input.metaCostQuality ?? null)
      .input("metaCostSource", sql.NVarChar(40), input.metaCostSource ?? null)
      .query(`
        IF @providerMessageSid IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM dbo.whatsapp_message_cost_ledger
             WHERE provider_message_sid = @providerMessageSid
           )
        BEGIN
          SELECT CAST(NULL AS UNIQUEIDENTIFIER) AS id;
        END
        ELSE IF @whatsappMessageId IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM dbo.whatsapp_message_cost_ledger
             WHERE whatsapp_message_id = @whatsappMessageId
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
            sender_phone_masked,
            sender_billing_key,
            meta_csw_open,
            destination_country_code,
            message_kind,
            template_sid,
            template_name,
            flow_label,
            provider_status,
            provider_status_at,
            meta_billing_category,
            meta_cost_quality,
            meta_cost_source,
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
            @senderPhoneMasked,
            @senderBillingKey,
            @metaCswOpen,
            @destinationCountryCode,
            @messageKind,
            @templateSid,
            @templateName,
            @flowLabel,
            @providerStatus,
            @providerStatusAt,
            @metaBillingCategory,
            @metaCostQuality,
            @metaCostSource,
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
    tariffId?: string | null;
    providerStatus?: string | null;
  }): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("priceAmount", sql.Decimal(18, 6), input.priceAmount)
      .input("currency", sql.Char(3), input.currency)
      .input("tariffId", sql.UniqueIdentifier, input.tariffId ?? null)
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

  /**
   * Deterministic SERVICE ranks per sender billing key and calendar month (sent_at, id).
   * Safe under concurrency, duplicates, retries, and out-of-order processing.
   */
  async recomputeServiceMonthRanksForSenderMonth(input: {
    senderBillingKey: string;
    monthStartUtc: Date;
    nextMonthStartUtc: Date;
    focusId?: string;
  }): Promise<number | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("senderBillingKey", sql.NVarChar(64), input.senderBillingKey)
        .input("monthStartUtc", sql.DateTime2, input.monthStartUtc)
        .input("nextMonthStartUtc", sql.DateTime2, input.nextMonthStartUtc)
        .input("focusId", sql.UniqueIdentifier, input.focusId ?? null)
        .query(`
          ;WITH eligible AS (
            SELECT id
            FROM dbo.whatsapp_message_cost_ledger WITH (UPDLOCK, HOLDLOCK)
            WHERE sender_billing_key = @senderBillingKey
              AND meta_billing_category = N'SERVICE'
              AND meta_csw_open = 1
              AND sent_at >= @monthStartUtc
              AND sent_at < @nextMonthStartUtc
          ),
          ranked AS (
            SELECT
              e.id,
              ROW_NUMBER() OVER (ORDER BY l.sent_at ASC, l.id ASC) AS service_month_rank
            FROM eligible e
            INNER JOIN dbo.whatsapp_message_cost_ledger l ON l.id = e.id
          )
          UPDATE l
          SET service_month_rank = r.service_month_rank,
              updated_at = SYSUTCDATETIME()
          FROM dbo.whatsapp_message_cost_ledger l
          INNER JOIN ranked r ON r.id = l.id;

          SELECT service_month_rank
          FROM dbo.whatsapp_message_cost_ledger
          WHERE @focusId IS NOT NULL AND id = @focusId;
        `);
      await transaction.commit();
      const rankRow = result.recordset[0] as { service_month_rank: number | null } | undefined;
      if (!rankRow || rankRow.service_month_rank === null || rankRow.service_month_rank === undefined) {
        return null;
      }
      const rank = Number(rankRow.service_month_rank);
      return Number.isFinite(rank) ? rank : null;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  /** @deprecated use recomputeServiceMonthRanksForSenderMonth */
  async assignServiceMonthRank(input: {
    id: string;
    senderBillingKey: string;
    monthStartUtc: Date;
    nextMonthStartUtc: Date;
  }): Promise<number | null> {
    return this.recomputeServiceMonthRanksForSenderMonth({
      senderBillingKey: input.senderBillingKey,
      monthStartUtc: input.monthStartUtc,
      nextMonthStartUtc: input.nextMonthStartUtc,
      focusId: input.id,
    });
  },

  async updateMetaPricing(input: {
    id: string;
    metaBillingCategory: string;
    metaPriceAmount: string | null;
    metaCurrency: string | null;
    metaCostQuality: string;
    metaCostSource: string;
    metaTariffId: string | null;
    serviceMonthRank: number | null;
    metaCostNote: string | null;
    metaBillable: boolean;
    metaCswOpen?: boolean | null;
    senderBillingKey?: string | null;
    lockMetaPricing?: boolean;
  }): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("metaBillingCategory", sql.NVarChar(40), input.metaBillingCategory)
      .input("metaPriceAmount", sql.Decimal(18, 6), input.metaPriceAmount)
      .input("metaCurrency", sql.Char(3), input.metaCurrency)
      .input("metaCostQuality", sql.NVarChar(20), input.metaCostQuality)
      .input("metaCostSource", sql.NVarChar(40), input.metaCostSource)
      .input("metaTariffId", sql.UniqueIdentifier, input.metaTariffId)
      .input("serviceMonthRank", sql.Int, input.serviceMonthRank)
      .input("metaCostNote", sql.NVarChar(200), input.metaCostNote)
      .input("metaBillable", sql.Bit, input.metaBillable ? 1 : 0)
      .input(
        "metaCswOpen",
        sql.Bit,
        input.metaCswOpen === undefined ? null : input.metaCswOpen === null ? null : input.metaCswOpen ? 1 : 0,
      )
      .input("senderBillingKey", sql.NVarChar(64), input.senderBillingKey ?? null)
      .input("lockMetaPricing", sql.Bit, input.lockMetaPricing ? 1 : 0)
      .query(`
        UPDATE dbo.whatsapp_message_cost_ledger
        SET meta_billing_category = @metaBillingCategory,
            meta_price_amount = @metaPriceAmount,
            meta_currency = @metaCurrency,
            meta_cost_quality = @metaCostQuality,
            meta_cost_source = @metaCostSource,
            meta_tariff_id = @metaTariffId,
            service_month_rank = @serviceMonthRank,
            meta_cost_note = @metaCostNote,
            meta_billable = @metaBillable,
            meta_csw_open = COALESCE(@metaCswOpen, meta_csw_open),
            sender_billing_key = COALESCE(@senderBillingKey, sender_billing_key),
            meta_pricing_locked = CASE
              WHEN @lockMetaPricing = 1 THEN 1
              ELSE meta_pricing_locked
            END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id;
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
