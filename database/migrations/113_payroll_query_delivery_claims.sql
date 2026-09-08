/*
  Migration: 113_payroll_query_delivery_claims.sql
  Purpose:
    - Atomically claim on-demand payroll receipt sends
    - Fence concurrent workers with token + version
    - Preserve ambiguous post-send failures for manual reconciliation
  Rollback: rollback/113_payroll_query_delivery_claims_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries', N'U') IS NULL
BEGIN
    THROW 50113, 'Precondition failed: whatsapp_payroll_receipt_query_deliveries missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'processing_token'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        ADD processing_token UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'processing_version'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        ADD processing_version INT NOT NULL
            CONSTRAINT DF_wprqd_processing_version DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'processing_expires_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        ADD processing_expires_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'send_started_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        ADD send_started_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
      AND name = N'reconciliation_required_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_query_deliveries
        ADD reconciliation_required_at DATETIME2 NULL;
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
        CHECK (status IN (
            N'PENDING',
            N'PROCESSING',
            N'SEND_STARTED',
            N'ACCEPTED',
            N'FAILED',
            N'RECONCILIATION_REQUIRED'
        ));
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprqd_claim'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    CREATE INDEX IX_wprqd_claim
        ON dbo.whatsapp_payroll_receipt_query_deliveries (
            company_id,
            bot_session_id,
            employee_id,
            year,
            month,
            status,
            processing_expires_at
        )
        INCLUDE (payroll_receipt_id, processing_version);
END;
GO
