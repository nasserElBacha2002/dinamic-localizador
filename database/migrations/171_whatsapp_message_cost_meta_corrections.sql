/*
  Migration: 171_whatsapp_message_cost_meta_corrections.sql
  Purpose (DIN-419 review fixes):
    - Sender billing key (normalized E.164 hash, not masked phone)
    - Persist Meta CSW evidence; lock classification after first apply
    - Argentina Meta USD list rates (effective 2026-10-01) with documented source
  Rollback: rollback/171_whatsapp_message_cost_meta_corrections_rollback.sql
*/

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'sender_billing_key') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD sender_billing_key NVARCHAR(64) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_csw_open') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_csw_open BIT NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_pricing_locked') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_pricing_locked BIT NOT NULL
            CONSTRAINT DF_wmcl_meta_pricing_locked DEFAULT 0;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wmcl_service_rank_lookup'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    DROP INDEX IX_wmcl_service_rank_lookup ON dbo.whatsapp_message_cost_ledger;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wmcl_service_rank_lookup'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    CREATE INDEX IX_wmcl_service_rank_lookup
        ON dbo.whatsapp_message_cost_ledger (
            sender_billing_key,
            sent_at
        )
        INCLUDE (meta_billing_category, service_month_rank, meta_billable)
        WHERE meta_billing_category = N'SERVICE' AND meta_billable = 1;
END;
GO

/*
  Argentina USD list rates — Meta WhatsApp Business Platform rate card,
  market Argentina, effective 2026-10-01 (per-message, delivered).
  Source: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
  Cross-check: Meta USD rate card CSV linked from that page (market row Argentina).
*/
DECLARE @metaEffectiveFrom DATETIME2 = '2026-10-01T00:00:00.000Z';
DECLARE @metaSource NVARCHAR(200) = N'evidence:whatsapp-meta-tariff-evidence-ar-2026-10.json;verifiedAt=2026-11-18;Meta USD CSV AR 2026-10-01;developers.facebook.com/.../whatsapp/pricing';

IF NOT EXISTS (
    SELECT 1 FROM dbo.whatsapp_message_cost_tariffs
    WHERE category = N'META_MARKETING'
      AND country_or_region = N'AR'
      AND effective_from = @metaEffectiveFrom
)
BEGIN
    INSERT INTO dbo.whatsapp_message_cost_tariffs (
        category, currency, amount, country_or_region, source_reference, effective_from
    )
    VALUES (N'META_MARKETING', N'USD', 0.061800, N'AR', @metaSource, @metaEffectiveFrom);
END;

IF NOT EXISTS (
    SELECT 1 FROM dbo.whatsapp_message_cost_tariffs
    WHERE category = N'META_UTILITY'
      AND country_or_region = N'AR'
      AND effective_from = @metaEffectiveFrom
)
BEGIN
    INSERT INTO dbo.whatsapp_message_cost_tariffs (
        category, currency, amount, country_or_region, source_reference, effective_from
    )
    VALUES (N'META_UTILITY', N'USD', 0.026000, N'AR', @metaSource, @metaEffectiveFrom);
END;

IF NOT EXISTS (
    SELECT 1 FROM dbo.whatsapp_message_cost_tariffs
    WHERE category = N'META_AUTHENTICATION'
      AND country_or_region = N'AR'
      AND effective_from = @metaEffectiveFrom
)
BEGIN
    INSERT INTO dbo.whatsapp_message_cost_tariffs (
        category, currency, amount, country_or_region, source_reference, effective_from
    )
    VALUES (N'META_AUTHENTICATION', N'USD', 0.026000, N'AR', @metaSource, @metaEffectiveFrom);
END;

IF NOT EXISTS (
    SELECT 1 FROM dbo.whatsapp_message_cost_tariffs
    WHERE category = N'META_SERVICE'
      AND country_or_region = N'AR'
      AND effective_from = @metaEffectiveFrom
)
BEGIN
    INSERT INTO dbo.whatsapp_message_cost_tariffs (
        category, currency, amount, country_or_region, source_reference, effective_from
    )
    VALUES (N'META_SERVICE', N'USD', 0.026000, N'AR', @metaSource, @metaEffectiveFrom);
END;
GO