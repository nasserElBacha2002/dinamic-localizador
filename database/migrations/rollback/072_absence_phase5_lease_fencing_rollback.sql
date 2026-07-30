/*
  Rollback: 072_absence_phase5_lease_fencing_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_awsj_enqueue_command'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    DROP INDEX UQ_awsj_enqueue_command ON dbo.absence_workday_sync_jobs;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_awsj_processing_lease_expires'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    DROP INDEX IX_awsj_processing_lease_expires ON dbo.absence_workday_sync_jobs;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'enqueue_command_id'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs DROP COLUMN enqueue_command_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'lease_version'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs DROP CONSTRAINT DF_awsj_lease_version;
    ALTER TABLE dbo.absence_workday_sync_jobs DROP COLUMN lease_version;
END;
GO
