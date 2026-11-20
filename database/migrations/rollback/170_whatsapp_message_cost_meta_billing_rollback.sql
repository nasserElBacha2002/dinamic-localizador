/*
  Rollback: 170_whatsapp_message_cost_meta_billing_rollback.sql
*/

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_wmcl_whatsapp_message_id_no_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    DROP INDEX UX_wmcl_whatsapp_message_id_no_sid ON dbo.whatsapp_message_cost_ledger;
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

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_meta_tariff'
)
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT FK_wmcl_meta_tariff;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_billable') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_billable;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_cost_note') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_cost_note;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'service_month_rank') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN service_month_rank;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_tariff_id') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_tariff_id;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_cost_source') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_cost_source;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_cost_quality') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_cost_quality;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_currency') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_currency;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_price_amount') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_price_amount;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_billing_category') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_billing_category;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'destination_country_code') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN destination_country_code;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'sender_phone_masked') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN sender_phone_masked;
GO

IF OBJECT_ID(N'dbo.whatsapp_content_sid_meta_category', N'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_content_sid_meta_category;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_wmct_category'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs')
)
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_tariffs DROP CONSTRAINT CK_wmct_category;
    ALTER TABLE dbo.whatsapp_message_cost_tariffs
        ADD CONSTRAINT CK_wmct_category CHECK (category IN (N'TWILIO_WHATSAPP_CHANNEL'));
END;
GO