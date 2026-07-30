/*
  Migration: 067_absence_phase4_attachment_corrections.sql
  Purpose (Phase 4 corrections — additive only; do not edit 064/066 in place):
    - absence_request_drafts (upload session before submit)
    - attachment_policy_snapshot on absence_requests
    - attachments: draft_id, idempotency_key, lease fields
    - nullable absence_request_id when draft-bound
  Rollback: database/migrations/rollback/067_absence_phase4_attachment_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID('dbo.absence_request_drafts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.absence_request_drafts (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ard_id DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        absence_type_id UNIQUEIDENTIFIER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        start_period NVARCHAR(20) NOT NULL CONSTRAINT DF_ard_start_period DEFAULT N'FULL_DAY',
        end_period NVARCHAR(20) NOT NULL CONSTRAINT DF_ard_end_period DEFAULT N'FULL_DAY',
        reason NVARCHAR(1000) NOT NULL,
        attachment_policy_snapshot NVARCHAR(20) NOT NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_ard_status DEFAULT N'OPEN',
        created_by_user_id UNIQUEIDENTIFIER NULL,
        created_by_employee_id UNIQUEIDENTIFIER NULL,
        submit_idempotency_key NVARCHAR(120) NULL,
        submitted_request_id UNIQUEIDENTIFIER NULL,
        expires_at DATETIME2 NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_ard_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_ard_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_absence_request_drafts PRIMARY KEY (id),
        CONSTRAINT FK_ard_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
        CONSTRAINT FK_ard_employee FOREIGN KEY (employee_id) REFERENCES dbo.employees(id),
        CONSTRAINT FK_ard_type FOREIGN KEY (absence_type_id) REFERENCES dbo.absence_types(id),
        CONSTRAINT CK_ard_status CHECK (status IN (N'OPEN', N'SUBMITTED', N'EXPIRED', N'CANCELLED')),
        CONSTRAINT CK_ard_policy CHECK (attachment_policy_snapshot IN (N'FORBIDDEN', N'OPTIONAL', N'REQUIRED')),
        CONSTRAINT CK_ard_periods CHECK (
            start_period IN (N'FULL_DAY', N'AM', N'PM')
            AND end_period IN (N'FULL_DAY', N'AM', N'PM')
        )
    );

    CREATE INDEX IX_ard_company_status_expires
        ON dbo.absence_request_drafts (company_id, status, expires_at);

    CREATE UNIQUE INDEX UX_ard_submit_idempotency
        ON dbo.absence_request_drafts (company_id, submit_idempotency_key)
        WHERE submit_idempotency_key IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests')
      AND name = 'attachment_policy_snapshot'
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD attachment_policy_snapshot NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_requests_attachment_policy_snapshot'
      AND parent_object_id = OBJECT_ID('dbo.absence_requests')
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD CONSTRAINT CK_absence_requests_attachment_policy_snapshot
            CHECK (
                attachment_policy_snapshot IS NULL
                OR attachment_policy_snapshot IN (N'FORBIDDEN', N'OPTIONAL', N'REQUIRED')
            );
END;
GO

-- Backfill snapshot from current type policy for historical rows
UPDATE r
SET r.attachment_policy_snapshot = COALESCE(
    NULLIF(t.attachment_policy, N''),
    CASE WHEN t.requires_attachment = 1 THEN N'REQUIRED' ELSE N'OPTIONAL' END
)
FROM dbo.absence_requests r
INNER JOIN dbo.absence_types t ON t.id = r.absence_type_id AND t.company_id = r.company_id
WHERE r.attachment_policy_snapshot IS NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_request_attachments')
      AND name = 'draft_id'
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD draft_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_request_attachments')
      AND name = 'idempotency_key'
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD idempotency_key NVARCHAR(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_request_attachments')
      AND name = 'lease_owner'
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD lease_owner NVARCHAR(80) NULL,
            lease_expires_at DATETIME2 NULL;
END;
GO

-- Allow draft-bound rows without request id
IF EXISTS (
    SELECT 1
    FROM sys.columns c
    JOIN sys.tables t ON t.object_id = c.object_id
    WHERE t.name = 'absence_request_attachments'
      AND c.name = 'absence_request_id'
      AND c.is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ALTER COLUMN absence_request_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_ara_draft'
      AND parent_object_id = OBJECT_ID('dbo.absence_request_attachments')
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD CONSTRAINT FK_ara_draft
            FOREIGN KEY (draft_id) REFERENCES dbo.absence_request_drafts(id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ara_request_or_draft'
      AND parent_object_id = OBJECT_ID('dbo.absence_request_attachments')
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ADD CONSTRAINT CK_ara_request_or_draft CHECK (
            (absence_request_id IS NOT NULL AND draft_id IS NULL)
            OR (absence_request_id IS NULL AND draft_id IS NOT NULL)
            OR (absence_request_id IS NOT NULL AND draft_id IS NOT NULL)
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_ara_request_idempotency'
      AND object_id = OBJECT_ID('dbo.absence_request_attachments')
)
BEGIN
    CREATE UNIQUE INDEX UX_ara_request_idempotency
        ON dbo.absence_request_attachments (company_id, absence_request_id, idempotency_key)
        WHERE absence_request_id IS NOT NULL AND idempotency_key IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_ara_draft_idempotency'
      AND object_id = OBJECT_ID('dbo.absence_request_attachments')
)
BEGIN
    CREATE UNIQUE INDEX UX_ara_draft_idempotency
        ON dbo.absence_request_attachments (company_id, draft_id, idempotency_key)
        WHERE draft_id IS NOT NULL AND idempotency_key IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_ara_cleanup_lease'
      AND object_id = OBJECT_ID('dbo.absence_request_attachments')
)
BEGIN
    CREATE INDEX IX_ara_cleanup_lease
        ON dbo.absence_request_attachments (status, lease_expires_at, updated_at)
        WHERE status IN (N'PENDING_UPLOAD', N'UPLOADING', N'FAILED', N'PENDING_DELETE');
END;
GO
