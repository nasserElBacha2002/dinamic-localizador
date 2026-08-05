-- Rollback 079_company_lifecycle_deletion.sql
-- Safe ONLY before any lifecycle transition or purge.
-- After physical deletion, do not roll back — use forward-fix.

IF EXISTS (
  SELECT 1 FROM dbo.companies
  WHERE status IN (N'PENDING_DELETION', N'DELETING', N'DELETED', N'DELETION_FAILED')
)
BEGIN
  THROW 50001, 'Rollback 079 aborted: lifecycle statuses present. Irreversible after use.', 1;
END
GO

IF OBJECT_ID(N'dbo.company_deletion_records', N'U') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.company_deletion_records)
BEGIN
  THROW 50002, 'Rollback 079 aborted: company_deletion_records is not empty.', 1;
END
GO

IF OBJECT_ID(N'dbo.company_pending_storage_deletions', N'U') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.company_pending_storage_deletions)
BEGIN
  THROW 50003, 'Rollback 079 aborted: pending storage deletions exist.', 1;
END
GO

IF OBJECT_ID(N'dbo.company_lifecycle_events', N'U') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.company_lifecycle_events)
BEGIN
  THROW 50004, 'Rollback 079 aborted: company_lifecycle_events exist.', 1;
END
GO

IF OBJECT_ID(N'dbo.company_pending_storage_deletions', N'U') IS NOT NULL
  DROP TABLE dbo.company_pending_storage_deletions;
GO

IF OBJECT_ID(N'dbo.company_deletion_records', N'U') IS NOT NULL
  DROP TABLE dbo.company_deletion_records;
GO

IF OBJECT_ID(N'dbo.company_lifecycle_events', N'U') IS NOT NULL
  DROP TABLE dbo.company_lifecycle_events;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_companies_status_scheduled_deletion'
    AND object_id = OBJECT_ID(N'dbo.companies')
)
  DROP INDEX IX_companies_status_scheduled_deletion ON dbo.companies;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_companies_deletion_claim'
    AND object_id = OBJECT_ID(N'dbo.companies')
)
  DROP INDEX IX_companies_deletion_claim ON dbo.companies;
GO

IF OBJECT_ID(N'dbo.CK_companies_status', N'C') IS NOT NULL
  ALTER TABLE dbo.companies DROP CONSTRAINT CK_companies_status;
GO

ALTER TABLE dbo.companies WITH CHECK
  ADD CONSTRAINT CK_companies_status CHECK (
    status IN (N'ACTIVE', N'INACTIVE', N'SUSPENDED')
  );
GO

IF OBJECT_ID(N'dbo.FK_companies_reactivated_by_user', N'F') IS NOT NULL
  ALTER TABLE dbo.companies DROP CONSTRAINT FK_companies_reactivated_by_user;
GO
IF OBJECT_ID(N'dbo.FK_companies_deactivated_by_user', N'F') IS NOT NULL
  ALTER TABLE dbo.companies DROP CONSTRAINT FK_companies_deactivated_by_user;
GO

IF OBJECT_ID(N'dbo.DF_companies_deletion_attempts', N'D') IS NOT NULL
  ALTER TABLE dbo.companies DROP CONSTRAINT DF_companies_deletion_attempts;
GO

IF COL_LENGTH('dbo.companies', 'deletion_next_attempt_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_next_attempt_at;
GO
IF COL_LENGTH('dbo.companies', 'deletion_purge_stage') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_purge_stage;
GO
IF COL_LENGTH('dbo.companies', 'deletion_lease_expires_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_lease_expires_at;
GO
IF COL_LENGTH('dbo.companies', 'deletion_lease_owner') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_lease_owner;
GO
IF COL_LENGTH('dbo.companies', 'deletion_last_error') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_last_error;
GO
IF COL_LENGTH('dbo.companies', 'deletion_attempts') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_attempts;
GO
IF COL_LENGTH('dbo.companies', 'deleted_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deleted_at;
GO
IF COL_LENGTH('dbo.companies', 'deletion_started_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_started_at;
GO
IF COL_LENGTH('dbo.companies', 'reactivated_by_user_id') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN reactivated_by_user_id;
GO
IF COL_LENGTH('dbo.companies', 'reactivated_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN reactivated_at;
GO
IF COL_LENGTH('dbo.companies', 'scheduled_deletion_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN scheduled_deletion_at;
GO
IF COL_LENGTH('dbo.companies', 'deactivation_reason') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deactivation_reason;
GO
IF COL_LENGTH('dbo.companies', 'deactivated_by_user_id') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deactivated_by_user_id;
GO
IF COL_LENGTH('dbo.companies', 'deactivated_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deactivated_at;
GO
