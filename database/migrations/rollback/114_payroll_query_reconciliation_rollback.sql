IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wprqd_bot_session_company'
      AND parent_object_id =
        OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP CONSTRAINT FK_wprqd_bot_session_company;
END;
GO

ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
    ADD CONSTRAINT FK_wprqd_bot_session
        FOREIGN KEY (bot_session_id) REFERENCES dbo.bot_sessions (id);
GO

DROP INDEX IF EXISTS IX_wprqd_reconciliation_backlog
    ON dbo.whatsapp_payroll_receipt_query_deliveries;
DROP INDEX IF EXISTS UX_wprqd_reconciliation_command
    ON dbo.whatsapp_payroll_receipt_query_deliveries;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_wprqd_reconciled_by_user'
      AND parent_object_id =
        OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP CONSTRAINT FK_wprqd_reconciled_by_user;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_wprqd_reconciliation_resolution'
      AND parent_object_id =
        OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP CONSTRAINT CK_wprqd_reconciliation_resolution;
END;
GO

ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries DROP COLUMN
    reconciliation_command_id,
    reconciliation_resolution,
    reconciliation_reason,
    reconciled_at,
    reconciled_by_user_id;
GO

DROP INDEX IF EXISTS UQ_bot_sessions_company_id ON dbo.bot_sessions;
GO
