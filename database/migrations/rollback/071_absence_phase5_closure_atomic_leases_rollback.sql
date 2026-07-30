/*
  Rollback: 071_absence_phase5_closure_atomic_leases_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_aoc_attendance_record'
      AND object_id = OBJECT_ID('dbo.absence_operational_conflicts')
)
BEGIN
    DROP INDEX IX_aoc_attendance_record ON dbo.absence_operational_conflicts;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_aoc_resolution_command'
      AND object_id = OBJECT_ID('dbo.absence_operational_conflicts')
)
BEGIN
    DROP INDEX UQ_aoc_resolution_command ON dbo.absence_operational_conflicts;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_operational_conflicts')
      AND name = 'resolution_command_id'
)
BEGIN
    ALTER TABLE dbo.absence_operational_conflicts
        DROP COLUMN resolution_command_id,
                    attendance_record_id,
                    source_message_sid,
                    operation_workday_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_awsj_claim_lease'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    DROP INDEX IX_awsj_claim_lease ON dbo.absence_workday_sync_jobs;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'lease_owner'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs
        DROP COLUMN lease_owner, lease_expires_at;
END;
GO
