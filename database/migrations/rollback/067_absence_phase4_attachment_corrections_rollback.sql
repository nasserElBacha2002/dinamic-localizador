/*
  Rollback for 067_absence_phase4_attachment_corrections.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_ara_cleanup_lease'
      AND object_id = OBJECT_ID('dbo.absence_request_attachments')
)
    DROP INDEX IX_ara_cleanup_lease ON dbo.absence_request_attachments;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_ara_draft_idempotency'
      AND object_id = OBJECT_ID('dbo.absence_request_attachments')
)
    DROP INDEX UX_ara_draft_idempotency ON dbo.absence_request_attachments;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_ara_request_idempotency'
      AND object_id = OBJECT_ID('dbo.absence_request_attachments')
)
    DROP INDEX UX_ara_request_idempotency ON dbo.absence_request_attachments;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ara_request_or_draft'
      AND parent_object_id = OBJECT_ID('dbo.absence_request_attachments')
)
    ALTER TABLE dbo.absence_request_attachments DROP CONSTRAINT CK_ara_request_or_draft;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_ara_draft'
)
    ALTER TABLE dbo.absence_request_attachments DROP CONSTRAINT FK_ara_draft;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_request_attachments') AND name = 'lease_owner'
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments DROP COLUMN lease_owner;
    ALTER TABLE dbo.absence_request_attachments DROP COLUMN lease_expires_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_request_attachments') AND name = 'idempotency_key'
)
    ALTER TABLE dbo.absence_request_attachments DROP COLUMN idempotency_key;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_request_attachments') AND name = 'draft_id'
)
    ALTER TABLE dbo.absence_request_attachments DROP COLUMN draft_id;
GO

-- Re-require request id only if no draft-only rows remain
IF NOT EXISTS (
    SELECT 1 FROM dbo.absence_request_attachments WHERE absence_request_id IS NULL
)
AND EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_request_attachments')
      AND name = 'absence_request_id'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE dbo.absence_request_attachments
        ALTER COLUMN absence_request_id UNIQUEIDENTIFIER NOT NULL;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_requests_attachment_policy_snapshot'
)
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT CK_absence_requests_attachment_policy_snapshot;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'attachment_policy_snapshot'
)
    ALTER TABLE dbo.absence_requests DROP COLUMN attachment_policy_snapshot;
GO

IF OBJECT_ID('dbo.absence_request_drafts', 'U') IS NOT NULL
    DROP TABLE dbo.absence_request_drafts;
GO
