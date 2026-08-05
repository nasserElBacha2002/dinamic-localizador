/*
  Migration: 081_payroll_receipts.sql
  Purpose:
    - payroll_receipt_batches + payroll_receipts tables
    - Enable payroll_receipts module for existing companies
  Rollback: database/migrations/rollback/081_payroll_receipts_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.payroll_receipt_batches', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.payroll_receipt_batches (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_prb_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        status NVARCHAR(40) NOT NULL,
        total_files INT NOT NULL CONSTRAINT DF_prb_total DEFAULT 0,
        processed_files INT NOT NULL CONSTRAINT DF_prb_processed DEFAULT 0,
        associated_files INT NOT NULL CONSTRAINT DF_prb_associated DEFAULT 0,
        failed_files INT NOT NULL CONSTRAINT DF_prb_failed DEFAULT 0,
        created_by_user_id UNIQUEIDENTIFIER NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_prb_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_prb_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_payroll_receipt_batches PRIMARY KEY (id),
        CONSTRAINT FK_prb_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
        CONSTRAINT CK_prb_month CHECK (month >= 1 AND month <= 12),
        CONSTRAINT CK_prb_status CHECK (status IN (
            N'DRAFT', N'PROCESSING', N'COMPLETED', N'COMPLETED_WITH_ERRORS', N'FAILED'
        ))
    );

    CREATE INDEX IX_prb_company_period
        ON dbo.payroll_receipt_batches (company_id, year, month);

    CREATE INDEX IX_prb_company_created
        ON dbo.payroll_receipt_batches (company_id, created_at);
END;
GO

IF OBJECT_ID(N'dbo.payroll_receipts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.payroll_receipts (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_pr_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        batch_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        original_filename NVARCHAR(255) NOT NULL,
        storage_provider NVARCHAR(40) NOT NULL CONSTRAINT DF_pr_provider DEFAULT N'GOOGLE_CLOUD_STORAGE',
        storage_bucket NVARCHAR(200) NULL,
        storage_object_key NVARCHAR(500) NULL,
        object_generation BIGINT NULL,
        detected_document NVARCHAR(20) NULL,
        normalized_document NVARCHAR(20) NULL,
        status NVARCHAR(40) NOT NULL,
        error_code NVARCHAR(80) NULL,
        error_message NVARCHAR(1000) NULL,
        mime_type NVARCHAR(120) NULL,
        file_size BIGINT NULL,
        checksum_sha256 CHAR(64) NULL,
        idempotency_key NVARCHAR(128) NULL,
        uploaded_by_user_id UNIQUEIDENTIFIER NULL,
        replaced_receipt_id UNIQUEIDENTIFIER NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_pr_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_pr_updated DEFAULT SYSUTCDATETIME(),
        deleted_at DATETIME2 NULL,
        deleted_by_user_id UNIQUEIDENTIFIER NULL,
        CONSTRAINT PK_payroll_receipts PRIMARY KEY (id),
        CONSTRAINT FK_pr_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
        CONSTRAINT FK_pr_batch FOREIGN KEY (batch_id) REFERENCES dbo.payroll_receipt_batches(id),
        CONSTRAINT FK_pr_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id),
        CONSTRAINT FK_pr_replaced FOREIGN KEY (replaced_receipt_id) REFERENCES dbo.payroll_receipts(id),
        CONSTRAINT CK_pr_month CHECK (month >= 1 AND month <= 12),
        CONSTRAINT CK_pr_provider CHECK (storage_provider = N'GOOGLE_CLOUD_STORAGE'),
        CONSTRAINT CK_pr_status CHECK (status IN (
            N'PENDING', N'UPLOADING', N'ASSOCIATED', N'DOCUMENT_NOT_FOUND', N'INVALID_DOCUMENT',
            N'AMBIGUOUS_DOCUMENT', N'EMPLOYEE_NOT_FOUND', N'EMPLOYEE_DOCUMENT_AMBIGUOUS',
            N'DUPLICATE', N'UPLOAD_FAILED', N'FAILED', N'REPLACED', N'DELETED'
        ))
    );

    CREATE INDEX IX_pr_company_employee
        ON dbo.payroll_receipts (company_id, employee_id);

    CREATE INDEX IX_pr_company_batch
        ON dbo.payroll_receipts (company_id, batch_id);

    CREATE INDEX IX_pr_company_period_status
        ON dbo.payroll_receipts (company_id, year, month, status);

    CREATE INDEX IX_pr_company_created
        ON dbo.payroll_receipts (company_id, created_at);

    CREATE UNIQUE INDEX UX_payroll_receipts_active_period
        ON dbo.payroll_receipts (company_id, employee_id, year, month)
        WHERE deleted_at IS NULL AND status = N'ASSOCIATED' AND employee_id IS NOT NULL;

    CREATE UNIQUE INDEX UX_payroll_receipts_idempotency
        ON dbo.payroll_receipts (company_id, batch_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
END;
GO

-- Enable module for all existing companies (idempotent)
INSERT INTO dbo.company_modules (company_id, module_key, is_enabled)
SELECT c.id, N'payroll_receipts', 1
FROM dbo.companies c
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.company_modules cm
    WHERE cm.company_id = c.id
      AND cm.module_key = N'payroll_receipts'
);
GO
