/*
  Migration: 072_absence_phase5_lease_fencing.sql
  Purpose (Phase 5 final hardening):
    - lease_version fencing token on absence_workday_sync_jobs
    - batched recovery index (status, lease_expires_at)
    - optional enqueue_command_id for manual reconcile idempotency
  Rollback: database/migrations/rollback/072_absence_phase5_lease_fencing_rollback.sql
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'lease_version'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs
        ADD lease_version BIGINT NOT NULL
            CONSTRAINT DF_awsj_lease_version DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'enqueue_command_id'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs
        ADD enqueue_command_id NVARCHAR(120) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_awsj_processing_lease_expires'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    CREATE INDEX IX_awsj_processing_lease_expires
        ON dbo.absence_workday_sync_jobs (status, lease_expires_at)
        INCLUDE (attempt_count, lease_owner, lease_version);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_awsj_enqueue_command'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    CREATE UNIQUE INDEX UQ_awsj_enqueue_command
        ON dbo.absence_workday_sync_jobs (company_id, enqueue_command_id)
        WHERE enqueue_command_id IS NOT NULL;
END;
GO
