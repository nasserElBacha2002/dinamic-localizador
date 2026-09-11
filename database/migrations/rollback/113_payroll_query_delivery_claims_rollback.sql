IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries', N'U') IS NULL
    RETURN;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.whatsapp_payroll_receipt_query_deliveries
    WHERE status IN (N'SEND_STARTED', N'RECONCILIATION_REQUIRED')
)
BEGIN
    THROW 50113, 'Rollback blocked: resolve ambiguous payroll receipt sends first', 1;
END;
GO

UPDATE dbo.whatsapp_payroll_receipt_query_deliveries
SET status = N'FAILED'
WHERE status = N'PROCESSING';
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprqd_claim'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    DROP INDEX IX_wprqd_claim
        ON dbo.whatsapp_payroll_receipt_query_deliveries;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_wprqd_status'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP CONSTRAINT CK_wprqd_status;
END;
GO

ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
    ADD CONSTRAINT CK_wprqd_status
        CHECK (status IN (N'PENDING', N'ACCEPTED', N'FAILED'));
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'reconciliation_required_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP COLUMN reconciliation_required_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'send_started_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP COLUMN send_started_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'processing_expires_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP COLUMN processing_expires_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = N'DF_wprqd_processing_version'
      AND parent_object_id =
        OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP CONSTRAINT DF_wprqd_processing_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'processing_version'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP COLUMN processing_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'processing_token'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        DROP COLUMN processing_token;
END;
GO
