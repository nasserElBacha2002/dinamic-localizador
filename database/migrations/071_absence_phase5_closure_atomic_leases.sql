/*
  Migration: 071_absence_phase5_closure_atomic_leases.sql
  Purpose (Phase 5 closure):
    - Worker lease fencing on absence_workday_sync_jobs
    - Conflict resolution command idempotency
    - Attendance conflict evidence columns (record / message / operation workday)
  Rollback: database/migrations/rollback/071_absence_phase5_closure_atomic_leases_rollback.sql
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'lease_owner'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs
        ADD lease_owner NVARCHAR(80) NULL,
            lease_expires_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_awsj_claim_lease'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    CREATE INDEX IX_awsj_claim_lease
        ON dbo.absence_workday_sync_jobs (status, lease_expires_at, updated_at)
        INCLUDE (attempt_count);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_operational_conflicts')
      AND name = 'resolution_command_id'
)
BEGIN
    ALTER TABLE dbo.absence_operational_conflicts
        ADD resolution_command_id NVARCHAR(120) NULL,
            attendance_record_id UNIQUEIDENTIFIER NULL,
            source_message_sid NVARCHAR(64) NULL,
            operation_workday_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_aoc_resolution_command'
      AND object_id = OBJECT_ID('dbo.absence_operational_conflicts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_aoc_resolution_command
        ON dbo.absence_operational_conflicts (company_id, resolution_command_id)
        WHERE resolution_command_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_aoc_attendance_record'
      AND object_id = OBJECT_ID('dbo.absence_operational_conflicts')
)
BEGIN
    CREATE INDEX IX_aoc_attendance_record
        ON dbo.absence_operational_conflicts (company_id, attendance_record_id)
        WHERE attendance_record_id IS NOT NULL;
END;
GO
