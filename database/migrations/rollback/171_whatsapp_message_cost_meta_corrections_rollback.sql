/*
  Rollback: 171_whatsapp_message_cost_meta_corrections_rollback.sql
*/

DELETE FROM dbo.whatsapp_message_cost_tariffs
WHERE country_or_region = N'AR'
  AND category IN (N'META_MARKETING', N'META_UTILITY', N'META_AUTHENTICATION', N'META_SERVICE')
  AND effective_from = '2026-10-01T00:00:00.000Z'
  AND source_reference LIKE N'Meta WABA USD list rates Argentina%'
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.whatsapp_message_cost_ledger l
    WHERE l.meta_tariff_id = dbo.whatsapp_message_cost_tariffs.id
  );
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_pricing_locked') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT DF_wmcl_meta_pricing_locked;
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_pricing_locked;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'meta_csw_open') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN meta_csw_open;
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'sender_billing_key') IS NOT NULL
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN sender_billing_key;
GO