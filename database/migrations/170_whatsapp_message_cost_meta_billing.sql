/*
  Migration: 170_whatsapp_message_cost_meta_billing.sql
  Purpose (DIN-419):
    - Extend WhatsApp message cost ledger for Twilio channel + Meta components
    - Versioned Meta tariffs and Content SID → Meta billing category mapping
    - Service message month rank for 1000 free tier (per sender, from 2026-10-01)
  Rollback: rollback/170_whatsapp_message_cost_meta_billing_rollback.sql

  Notes:
    - No regional Meta price seeds (operators must insert tariffs with source_reference).
    - Historical rows keep NULL Meta fields until sync/reconcile backfill jobs run.
*/

/* ── Extend tariff categories ── */
IF OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_wmct_category'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs')
    )
    BEGIN
        ALTER TABLE dbo.whatsapp_message_cost_tariffs DROP CONSTRAINT CK_wmct_category;
    END;

    ALTER TABLE dbo.whatsapp_message_cost_tariffs
        ADD CONSTRAINT CK_wmct_category CHECK (
            category IN (
                N'TWILIO_WHATSAPP_CHANNEL',
                N'META_SERVICE',
                N'META_MARKETING',
                N'META_UTILITY',
                N'META_AUTHENTICATION'
            )
        );
END;
GO

/* ── Content SID → Meta billing category (no prices) ── */
IF OBJECT_ID(N'dbo.whatsapp_content_sid_meta_category', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_content_sid_meta_category (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_wcsmc PRIMARY KEY DEFAULT NEWID(),
        content_sid NVARCHAR(100) NOT NULL,
        meta_billing_category NVARCHAR(40) NOT NULL,
        source_reference NVARCHAR(200) NOT NULL,
        effective_from DATETIME2 NOT NULL,
        effective_to DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wcsmc_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wcsmc_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_wcsmc_category CHECK (
            meta_billing_category IN (
                N'SERVICE',
                N'MARKETING',
                N'UTILITY',
                N'AUTHENTICATION'
            )
        ),
        CONSTRAINT CK_wcsmc_effective_range CHECK (
            effective_to IS NULL OR effective_to > effective_from
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_wcsmc_content_sid_effective'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_content_sid_meta_category')
)
BEGIN
    CREATE UNIQUE INDEX UX_wcsmc_content_sid_effective
        ON dbo.whatsapp_content_sid_meta_category (content_sid, effective_from)
        WHERE effective_to IS NULL;
END;
GO

/* ── Ledger Meta / sender columns ── */
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'sender_phone_masked') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD sender_phone_masked NVARCHAR(40) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'destination_country_code') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD destination_country_code CHAR(2) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_billing_category') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_billing_category NVARCHAR(40) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_price_amount') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_price_amount DECIMAL(18, 6) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_currency') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_currency CHAR(3) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_cost_quality') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_cost_quality NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_cost_source') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_cost_source NVARCHAR(40) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_tariff_id') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_tariff_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'service_month_rank') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD service_month_rank INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_cost_note') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_cost_note NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_billable') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD meta_billable BIT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_meta_tariff'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD CONSTRAINT FK_wmcl_meta_tariff
            FOREIGN KEY (meta_tariff_id) REFERENCES dbo.whatsapp_message_cost_tariffs (id);
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
            sender_phone_masked,
            sent_at
        )
        INCLUDE (meta_billing_category, service_month_rank, meta_billable)
        WHERE meta_billing_category = N'SERVICE' AND meta_billable = 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_wmcl_whatsapp_message_id_no_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    CREATE UNIQUE INDEX UX_wmcl_whatsapp_message_id_no_sid
        ON dbo.whatsapp_message_cost_ledger (whatsapp_message_id)
        WHERE provider_message_sid IS NULL AND whatsapp_message_id IS NOT NULL;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_wmcl_cost_source'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT CK_wmcl_cost_source;
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD CONSTRAINT CK_wmcl_cost_source CHECK (
            cost_source IN (
                N'TWILIO_MESSAGE_RESOURCE',
                N'TARIFF_TABLE',
                N'NONE',
                N'HISTORICAL_BACKFILL',
                N'META_POLICY'
            )
        );
END;
GO