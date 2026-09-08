/*
  Manual, audited reconciliation evidence for ambiguous payroll receipt sends.
*/

ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries ADD
    reconciliation_command_id UNIQUEIDENTIFIER NULL,
    reconciliation_resolution NVARCHAR(30) NULL,
    reconciliation_reason NVARCHAR(500) NULL,
    reconciled_at DATETIME2 NULL,
    reconciled_by_user_id UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
    ADD CONSTRAINT CK_wprqd_reconciliation_resolution CHECK (
        reconciliation_resolution IS NULL
        OR reconciliation_resolution IN (
            N'CONFIRMED_ACCEPTED',
            N'CONFIRMED_NOT_SENT'
        )
    );
GO

ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
    ADD CONSTRAINT FK_wprqd_reconciled_by_user
        FOREIGN KEY (reconciled_by_user_id) REFERENCES dbo.users (id);
GO

CREATE UNIQUE INDEX UX_wprqd_reconciliation_command
    ON dbo.whatsapp_payroll_receipt_query_deliveries (reconciliation_command_id)
    WHERE reconciliation_command_id IS NOT NULL;
GO

CREATE INDEX IX_wprqd_reconciliation_backlog
    ON dbo.whatsapp_payroll_receipt_query_deliveries (
        company_id,
        status,
        reconciliation_required_at,
        id
    );
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_bot_sessions_company_id'
      AND object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    CREATE UNIQUE INDEX UQ_bot_sessions_company_id
        ON dbo.bot_sessions (company_id, id);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wprqd_bot_session'
      AND parent_object_id =
        OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP CONSTRAINT FK_wprqd_bot_session;
END;
GO

ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
    ADD CONSTRAINT FK_wprqd_bot_session_company
        FOREIGN KEY (company_id, bot_session_id)
        REFERENCES dbo.bot_sessions (company_id, id);
GO
