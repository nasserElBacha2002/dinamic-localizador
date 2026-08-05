-- Additive hardening for company lifecycle after 079.
-- Rollback: database/migrations/rollback/080_company_lifecycle_hardening_rollback.sql

-- Companies: missing columns (safety if 079 partially applied) + checkpoint/retry.
IF COL_LENGTH('dbo.companies', 'deactivated_at') IS NULL
  ALTER TABLE dbo.companies ADD deactivated_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.companies', 'deactivated_by_user_id') IS NULL
  ALTER TABLE dbo.companies ADD deactivated_by_user_id UNIQUEIDENTIFIER NULL;
GO
IF COL_LENGTH('dbo.companies', 'deactivation_reason') IS NULL
  ALTER TABLE dbo.companies ADD deactivation_reason NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.companies', 'scheduled_deletion_at') IS NULL
  ALTER TABLE dbo.companies ADD scheduled_deletion_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.companies', 'reactivated_at') IS NULL
  ALTER TABLE dbo.companies ADD reactivated_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.companies', 'reactivated_by_user_id') IS NULL
  ALTER TABLE dbo.companies ADD reactivated_by_user_id UNIQUEIDENTIFIER NULL;
GO
IF COL_LENGTH('dbo.companies', 'deletion_started_at') IS NULL
  ALTER TABLE dbo.companies ADD deletion_started_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.companies', 'deleted_at') IS NULL
  ALTER TABLE dbo.companies ADD deleted_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.companies', 'deletion_attempts') IS NULL
  ALTER TABLE dbo.companies ADD deletion_attempts INT NOT NULL
    CONSTRAINT DF_companies_deletion_attempts DEFAULT (0);
GO
IF COL_LENGTH('dbo.companies', 'deletion_last_error') IS NULL
  ALTER TABLE dbo.companies ADD deletion_last_error NVARCHAR(1000) NULL;
GO
IF COL_LENGTH('dbo.companies', 'deletion_lease_owner') IS NULL
  ALTER TABLE dbo.companies ADD deletion_lease_owner NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.companies', 'deletion_lease_expires_at') IS NULL
  ALTER TABLE dbo.companies ADD deletion_lease_expires_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.companies', 'deletion_purge_stage') IS NULL
  ALTER TABLE dbo.companies ADD deletion_purge_stage NVARCHAR(40) NULL;
GO
IF COL_LENGTH('dbo.companies', 'deletion_next_attempt_at') IS NULL
  ALTER TABLE dbo.companies ADD deletion_next_attempt_at DATETIME2(3) NULL;
GO

IF OBJECT_ID(N'dbo.FK_companies_deactivated_by_user', N'F') IS NULL
BEGIN
  ALTER TABLE dbo.companies WITH CHECK
    ADD CONSTRAINT FK_companies_deactivated_by_user
    FOREIGN KEY (deactivated_by_user_id) REFERENCES dbo.users(id);
END
GO

IF OBJECT_ID(N'dbo.FK_companies_reactivated_by_user', N'F') IS NULL
BEGIN
  ALTER TABLE dbo.companies WITH CHECK
    ADD CONSTRAINT FK_companies_reactivated_by_user
    FOREIGN KEY (reactivated_by_user_id) REFERENCES dbo.users(id);
END
GO

-- Ensure status CHECK includes lifecycle values (idempotent replace).
IF OBJECT_ID(N'dbo.CK_companies_status', N'C') IS NOT NULL
BEGIN
  ALTER TABLE dbo.companies DROP CONSTRAINT CK_companies_status;
END
GO

ALTER TABLE dbo.companies WITH CHECK
  ADD CONSTRAINT CK_companies_status CHECK (
    status IN (
      N'ACTIVE', N'INACTIVE', N'SUSPENDED',
      N'PENDING_DELETION', N'DELETING', N'DELETED', N'DELETION_FAILED'
    )
  );
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_companies_status_scheduled_deletion'
    AND object_id = OBJECT_ID(N'dbo.companies')
)
BEGIN
  CREATE INDEX IX_companies_status_scheduled_deletion
    ON dbo.companies (status, scheduled_deletion_at)
    WHERE scheduled_deletion_at IS NOT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_companies_deletion_claim'
    AND object_id = OBJECT_ID(N'dbo.companies')
)
BEGIN
  CREATE INDEX IX_companies_deletion_claim
    ON dbo.companies (status, deletion_lease_expires_at, deletion_next_attempt_at);
END
GO

-- Pending storage: retry scheduling
IF OBJECT_ID(N'dbo.company_pending_storage_deletions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.company_pending_storage_deletions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_company_pending_storage_deletions_id DEFAULT NEWSEQUENTIALID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    storage_object_key NVARCHAR(1000) NOT NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_company_pending_storage_deletions_status DEFAULT N'PENDING',
    attempts INT NOT NULL CONSTRAINT DF_company_pending_storage_deletions_attempts DEFAULT (0),
    last_error NVARCHAR(1000) NULL,
    next_attempt_at DATETIME2(3) NULL,
    created_at DATETIME2(3) NOT NULL CONSTRAINT DF_company_pending_storage_deletions_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_company_pending_storage_deletions_updated DEFAULT SYSUTCDATETIME(),
    deleted_at DATETIME2(3) NULL,
    CONSTRAINT PK_company_pending_storage_deletions PRIMARY KEY (id),
    CONSTRAINT UQ_company_pending_storage_deletions_key UNIQUE (company_id, storage_object_key),
    CONSTRAINT CK_company_pending_storage_deletions_status CHECK (
      status IN (N'PENDING', N'DELETED', N'FAILED')
    )
  );
END
GO

IF COL_LENGTH('dbo.company_pending_storage_deletions', 'next_attempt_at') IS NULL
  ALTER TABLE dbo.company_pending_storage_deletions ADD next_attempt_at DATETIME2(3) NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_company_pending_storage_deletions_retry'
    AND object_id = OBJECT_ID(N'dbo.company_pending_storage_deletions')
)
BEGIN
  CREATE INDEX IX_company_pending_storage_deletions_retry
    ON dbo.company_pending_storage_deletions (company_id, status, next_attempt_at);
END
GO

-- Deletion attempt records: ensure table + attempt fields
IF OBJECT_ID(N'dbo.company_deletion_records', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.company_deletion_records (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_company_deletion_records_id DEFAULT NEWSEQUENTIALID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    company_name NVARCHAR(200) NOT NULL,
    previous_status NVARCHAR(30) NOT NULL,
    deactivated_at DATETIME2(3) NULL,
    deactivated_by_user_id UNIQUEIDENTIFIER NULL,
    deactivation_reason NVARCHAR(500) NULL,
    scheduled_deletion_at DATETIME2(3) NULL,
    deletion_started_at DATETIME2(3) NOT NULL,
    deleted_at DATETIME2(3) NULL,
    deletion_attempts INT NOT NULL CONSTRAINT DF_company_deletion_records_attempts DEFAULT (1),
    outcome NVARCHAR(30) NOT NULL,
    last_error NVARCHAR(1000) NULL,
    actor_user_id UNIQUEIDENTIFIER NULL,
    lease_owner NVARCHAR(100) NULL,
    purge_stage NVARCHAR(40) NULL,
    created_at DATETIME2(3) NOT NULL CONSTRAINT DF_company_deletion_records_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_company_deletion_records PRIMARY KEY (id),
    CONSTRAINT CK_company_deletion_records_outcome CHECK (
      outcome IN (N'STARTED', N'COMPLETED', N'FAILED')
    )
  );
END
GO

IF COL_LENGTH('dbo.company_deletion_records', 'lease_owner') IS NULL
  ALTER TABLE dbo.company_deletion_records ADD lease_owner NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.company_deletion_records', 'purge_stage') IS NULL
  ALTER TABLE dbo.company_deletion_records ADD purge_stage NVARCHAR(40) NULL;
GO

-- Durable lifecycle events (survives audit_logs purge)
IF OBJECT_ID(N'dbo.company_lifecycle_events', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.company_lifecycle_events (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_company_lifecycle_events_id DEFAULT NEWSEQUENTIALID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    event_type NVARCHAR(60) NOT NULL,
    previous_status NVARCHAR(30) NULL,
    new_status NVARCHAR(30) NULL,
    actor_user_id UNIQUEIDENTIFIER NULL,
    reason NVARCHAR(500) NULL,
    correlation_id NVARCHAR(100) NULL,
    details_json NVARCHAR(MAX) NULL,
    created_at DATETIME2(3) NOT NULL CONSTRAINT DF_company_lifecycle_events_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_company_lifecycle_events PRIMARY KEY (id)
  );

  CREATE INDEX IX_company_lifecycle_events_company
    ON dbo.company_lifecycle_events (company_id, created_at DESC);
END
GO
