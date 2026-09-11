/*
  Migration: 116_whatsapp_message_cost_ledger_corrections.sql
  Purpose:
    - Make ledger compatible with whatsapp_messages retention and company hard-delete
      (ON DELETE SET NULL for message/company/tariff FKs).
    - Persist company_name_snapshot for historical attribution after company_id nulls.
    - Add provider_status_at for monotonic status updates.
    - Prevent overlapping open tariffs for the same applicability key.
    - Worker heartbeat for operational status in Observability.
  Rollback: rollback/116_whatsapp_message_cost_ledger_corrections_rollback.sql
  Note: Does NOT drop historical cost rows. Rollback restores restrictive FKs and may
        fail if orphaned NULLs exist — use only on disposable DBs.
*/

-- Snapshot for historical imputation when company_id is cleared.
IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'company_name_snapshot') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD company_name_snapshot NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_message_cost_ledger', N'provider_status_at') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger
        ADD provider_status_at DATETIME2 NULL;
END;
GO

-- Backfill snapshots from live companies (best-effort).
UPDATE l
SET company_name_snapshot = LEFT(c.name, 200),
    updated_at = SYSUTCDATETIME()
FROM dbo.whatsapp_message_cost_ledger l
INNER JOIN dbo.companies c ON c.id = l.company_id
WHERE l.company_name_snapshot IS NULL
  AND l.company_id IS NOT NULL;
GO

-- Recreate FKs with ON DELETE SET NULL so retention/purge can delete messages/companies.
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_whatsapp_message'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT FK_wmcl_whatsapp_message;
END;
GO

ALTER TABLE dbo.whatsapp_message_cost_ledger
    ADD CONSTRAINT FK_wmcl_whatsapp_message
        FOREIGN KEY (whatsapp_message_id)
        REFERENCES dbo.whatsapp_messages (id)
        ON DELETE SET NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_company'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT FK_wmcl_company;
END;
GO

ALTER TABLE dbo.whatsapp_message_cost_ledger
    ADD CONSTRAINT FK_wmcl_company
        FOREIGN KEY (company_id)
        REFERENCES dbo.companies (id)
        ON DELETE SET NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wmcl_tariff'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger')
)
BEGIN
    ALTER TABLE dbo.whatsapp_message_cost_ledger DROP CONSTRAINT FK_wmcl_tariff;
END;
GO

ALTER TABLE dbo.whatsapp_message_cost_ledger
    ADD CONSTRAINT FK_wmcl_tariff
        FOREIGN KEY (tariff_id)
        REFERENCES dbo.whatsapp_message_cost_tariffs (id)
        ON DELETE SET NULL;
GO

-- Only one open-ended active tariff per applicability key.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_wmct_open_applicability'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_tariffs')
)
BEGIN
    CREATE UNIQUE INDEX UX_wmct_open_applicability
        ON dbo.whatsapp_message_cost_tariffs (
            category,
            currency,
            country_or_region
        )
        WHERE effective_to IS NULL;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_message_cost_sync_heartbeat', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_message_cost_sync_heartbeat (
        id TINYINT NOT NULL
            CONSTRAINT PK_wmcsh PRIMARY KEY
            CONSTRAINT CK_wmcsh_singleton CHECK (id = 1),
        last_run_at DATETIME2 NULL,
        last_success_at DATETIME2 NULL,
        last_result_json NVARCHAR(1500) NULL,
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wmcsh_updated_at DEFAULT SYSUTCDATETIME()
    );

    INSERT INTO dbo.whatsapp_message_cost_sync_heartbeat (id)
    VALUES (1);
END;
GO
