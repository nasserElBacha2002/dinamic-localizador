-- Import jobs for generic entity imports (preview/execute idempotency).
-- Rollback:
--   DROP TABLE IF EXISTS dbo.import_jobs;

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.import_jobs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.import_jobs (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_import_jobs_id DEFAULT NEWSEQUENTIALID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NULL,
    entity_type NVARCHAR(40) NOT NULL,
    strategy_version NVARCHAR(40) NOT NULL,
    file_name NVARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,
    confirmation_token UNIQUEIDENTIFIER NOT NULL,
    idempotency_key NVARCHAR(128) NULL,
    status NVARCHAR(20) NOT NULL,
    total_rows INT NOT NULL CONSTRAINT DF_import_jobs_total_rows DEFAULT (0),
    created_count INT NOT NULL CONSTRAINT DF_import_jobs_created_count DEFAULT (0),
    updated_count INT NOT NULL CONSTRAINT DF_import_jobs_updated_count DEFAULT (0),
    rejected_count INT NOT NULL CONSTRAINT DF_import_jobs_rejected_count DEFAULT (0),
    prepared_plan_json NVARCHAR(MAX) NULL,
    result_json NVARCHAR(MAX) NULL,
    general_error NVARCHAR(1000) NULL,
    expires_at DATETIME2 NOT NULL,
    started_at DATETIME2 NULL,
    finished_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_import_jobs_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_import_jobs_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_import_jobs PRIMARY KEY (id),
    CONSTRAINT FK_import_jobs_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
    CONSTRAINT CK_import_jobs_status CHECK (
      status IN (N'VALIDATING', N'READY', N'PROCESSING', N'COMPLETED', N'PARTIAL', N'FAILED')
    ),
    CONSTRAINT CK_import_jobs_entity_type CHECK (
      entity_type IN (N'operations', N'services', N'employees')
    )
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_import_jobs_company_created'
    AND object_id = OBJECT_ID(N'dbo.import_jobs')
)
BEGIN
  CREATE INDEX IX_import_jobs_company_created
    ON dbo.import_jobs (company_id, created_at DESC);
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_import_jobs_company_idempotency'
    AND object_id = OBJECT_ID(N'dbo.import_jobs')
)
BEGIN
  CREATE UNIQUE INDEX UQ_import_jobs_company_idempotency
    ON dbo.import_jobs (company_id, entity_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_import_jobs_confirmation_token'
    AND object_id = OBJECT_ID(N'dbo.import_jobs')
)
BEGIN
  CREATE UNIQUE INDEX IX_import_jobs_confirmation_token
    ON dbo.import_jobs (confirmation_token);
END
GO
