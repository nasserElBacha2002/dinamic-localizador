/*
  Rollback: 115_whatsapp_message_cost_ledger_rollback.sql
  Drops WhatsApp message cost ledger and versioned tariffs.
*/

IF OBJECT_ID(N'dbo.whatsapp_message_cost_ledger', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_message_cost_ledger;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_message_cost_tariffs;
END;
GO
