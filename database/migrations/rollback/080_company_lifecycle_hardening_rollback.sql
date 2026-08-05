-- Rollback 080_company_lifecycle_hardening.sql
-- Aborts if lifecycle has been used (irreversible purges / in-flight deletions).

IF EXISTS (
  SELECT 1 FROM dbo.companies
  WHERE status IN (N'PENDING_DELETION', N'DELETING', N'DELETED', N'DELETION_FAILED')
)
BEGIN
  THROW 50001, 'Rollback 080 aborted: companies with lifecycle statuses exist. Use forward-fix.', 1;
END
GO

IF OBJECT_ID(N'dbo.company_deletion_records', N'U') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.company_deletion_records)
BEGIN
  THROW 50002, 'Rollback 080 aborted: company_deletion_records is not empty.', 1;
END
GO

IF OBJECT_ID(N'dbo.company_pending_storage_deletions', N'U') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.company_pending_storage_deletions)
BEGIN
  THROW 50003, 'Rollback 080 aborted: company_pending_storage_deletions is not empty.', 1;
END
GO

IF OBJECT_ID(N'dbo.company_lifecycle_events', N'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.company_lifecycle_events;
END
GO

IF COL_LENGTH('dbo.company_deletion_records', 'purge_stage') IS NOT NULL
  ALTER TABLE dbo.company_deletion_records DROP COLUMN purge_stage;
GO
IF COL_LENGTH('dbo.company_deletion_records', 'lease_owner') IS NOT NULL
  ALTER TABLE dbo.company_deletion_records DROP COLUMN lease_owner;
GO

IF COL_LENGTH('dbo.company_pending_storage_deletions', 'next_attempt_at') IS NOT NULL
  ALTER TABLE dbo.company_pending_storage_deletions DROP COLUMN next_attempt_at;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_company_pending_storage_deletions_retry'
    AND object_id = OBJECT_ID(N'dbo.company_pending_storage_deletions')
)
  DROP INDEX IX_company_pending_storage_deletions_retry ON dbo.company_pending_storage_deletions;
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_companies_deletion_claim'
    AND object_id = OBJECT_ID(N'dbo.companies')
)
  DROP INDEX IX_companies_deletion_claim ON dbo.companies;
GO

IF COL_LENGTH('dbo.companies', 'deletion_next_attempt_at') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_next_attempt_at;
GO
IF COL_LENGTH('dbo.companies', 'deletion_purge_stage') IS NOT NULL
  ALTER TABLE dbo.companies DROP COLUMN deletion_purge_stage;
GO
