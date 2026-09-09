/*
  Rollback: 116_whatsapp_message_cost_ledger_corrections_rollback.sql
  WARNING: Restores NO ACTION FKs. Fails if orphan NULLs exist (ledger rows
  surviving deleted messages/companies). Use only on disposable databases.
  Does not delete historical cost rows.
*/

IF OBJECT_ID(N'dbo.whatsapp_message_cost_sync_heartbeat', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.whatsapp_message_cost_sync_heartbeat;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_wmct_open_applicability'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs')
)
BEGIN
    DROP INDEX UX_wmct_open_applicability ON dbo.whatsapp_message_cost_tariffs;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_tariff'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT FK_wmcl_tariff;
GO
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_company'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT FK_wmcl_company;
GO
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_whatsapp_message'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT FK_wmcl_whatsapp_message;
GO

-- Refuse restrictive FKs when orphans would violate them.
IF EXISTS (
    SELECT 1
    FROM dbo.whatsapp_message_cost_ledger l
    WHERE l.whatsapp_message_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.whatsapp_messages m WHERE m.id = l.whatsapp_message_id)
)
BEGIN
    THROW 50001, N'Rollback blocked: ledger rows reference deleted whatsapp_messages.', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.whatsapp_message_cost_ledger l
    WHERE l.company_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.companies c WHERE c.id = l.company_id)
)
BEGIN
    THROW 50002, N'Rollback blocked: ledger rows reference deleted companies.', 1;
END;
GO

ALTER TABLE dbo.whatsapp_message_cost_ledger
    ADD CONSTRAINT FK_wmcl_whatsapp_message
        FOREIGN KEY (whatsapp_message_id) REFERENCES dbo.whatsapp_messages (id);
GO
ALTER TABLE dbo.whatsapp_message_cost_ledger
    ADD CONSTRAINT FK_wmcl_company
        FOREIGN KEY (company_id) REFERENCES dbo.companies (id);
GO
ALTER TABLE dbo.whatsapp_message_cost_ledger
    ADD CONSTRAINT FK_wmcl_tariff
        FOREIGN KEY (tariff_id) REFERENCES dbo.whatsapp_message_cost_tariffs (id);
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'provider_status_at') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN provider_status_at;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'company_name_snapshot') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP COLUMN company_name_snapshot;
END;
GO
