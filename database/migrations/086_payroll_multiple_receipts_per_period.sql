/*
  Migration: 086_payroll_multiple_receipts_per_period.sql
  Purpose:
    - Allow multiple ASSOCIATED payroll receipts per company+employee+year+month
    - Deduplicate identical files via filtered unique on checksum_sha256
    - Non-unique index for period list queries
    - Persist WhatsApp period-query deliveries scoped by session+period
      (status ACCEPTED = Twilio messages.create accepted; not delivery callback)
  Rollback: database/migrations/rollback/086_payroll_multiple_receipts_per_period_rollback.sql
  Note: rollback of UX_payroll_receipts_active_period is NOT safe once multiple
        ASSOCIATED rows exist for the same period.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.payroll_receipts', N'U') IS NULL
BEGIN
    THROW 50086, 'Precondition failed: payroll_receipts missing', 1;
END;
GO

-- Remove single-active-per-period constraint
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_payroll_receipts_active_period'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    DROP INDEX UX_payroll_receipts_active_period ON dbo.payroll_receipts;
END;
GO

-- Efficient list of active receipts for employee+period
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_pr_active_employee_period'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    CREATE INDEX IX_pr_active_employee_period
        ON dbo.payroll_receipts (company_id, employee_id, year, month, created_at, id)
        WHERE deleted_at IS NULL
          AND status = N'ASSOCIATED'
          AND employee_id IS NOT NULL;
END;
GO

-- Prevent two ASSOCIATED rows with the same file bytes for the same employee+period.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_payroll_receipts_active_checksum'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    CREATE UNIQUE INDEX UX_payroll_receipts_active_checksum
        ON dbo.payroll_receipts (company_id, employee_id, year, month, checksum_sha256)
        WHERE deleted_at IS NULL
          AND status = N'ASSOCIATED'
          AND employee_id IS NOT NULL
          AND checksum_sha256 IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_payroll_receipt_query_deliveries (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_payroll_receipt_query_deliveries PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        bot_session_id UNIQUEIDENTIFIER NOT NULL,
        payroll_receipt_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        -- ACCEPTED = Twilio accepted the outbound create (retry skip). Not a delivery callback.
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_wprqd_status DEFAULT N'PENDING',
        provider_message_sid NVARCHAR(100) NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        accepted_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wprqd_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wprqd_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wprqd_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_wprqd_receipt_company
            FOREIGN KEY (payroll_receipt_id, company_id)
            REFERENCES dbo.payroll_receipts (id, company_id),
        CONSTRAINT FK_wprqd_employee_company
            FOREIGN KEY (employee_id, company_id)
            REFERENCES dbo.employees (id, company_id),
        CONSTRAINT FK_wprqd_bot_session
            FOREIGN KEY (bot_session_id) REFERENCES dbo.bot_sessions (id),
        CONSTRAINT CK_wprqd_status
            CHECK (status IN (N'PENDING', N'ACCEPTED', N'FAILED')),
        CONSTRAINT CK_wprqd_month CHECK (month BETWEEN 1 AND 12),
        CONSTRAINT CK_wprqd_year CHECK (year BETWEEN 1900 AND 2200)
    );
END;
GO

-- Logical query identity includes period so July deliveries never pollute August.
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_wprqd_session_receipt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    DROP INDEX UQ_wprqd_session_receipt ON dbo.whatsapp_payroll_receipt_query_deliveries;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_wprqd_session_period_receipt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    CREATE UNIQUE INDEX UQ_wprqd_session_period_receipt
        ON dbo.whatsapp_payroll_receipt_query_deliveries (
            company_id, bot_session_id, employee_id, year, month, payroll_receipt_id
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprqd_session_period_status'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_query_deliveries')
)
BEGIN
    CREATE INDEX IX_wprqd_session_period_status
        ON dbo.whatsapp_payroll_receipt_query_deliveries (
            company_id, bot_session_id, year, month, status
        );
END;
GO
