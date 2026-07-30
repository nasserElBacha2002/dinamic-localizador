/*
  Rollback: 070_absence_phase5_operational_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_awsj_request_status_version'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    DROP INDEX IX_awsj_request_status_version ON dbo.absence_workday_sync_jobs;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ar_op_recon_status'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT CK_ar_op_recon_status;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests')
      AND name = 'operational_reconciliation_status'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT DF_ar_op_recon_status;
    ALTER TABLE dbo.absence_requests DROP COLUMN operational_reconciliation_status;
    ALTER TABLE dbo.absence_requests DROP COLUMN operational_reconciliation_job_id;
    ALTER TABLE dbo.absence_requests DROP COLUMN operational_reconciliation_last_error;
    ALTER TABLE dbo.absence_requests DROP COLUMN operational_reconciliation_updated_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_workday_sync_jobs_status'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs DROP CONSTRAINT CK_absence_workday_sync_jobs_status;
END;
GO

-- Restore pre-070 statuses (rows with SUPERSEDED become FAILED for rollback safety).
UPDATE dbo.absence_workday_sync_jobs
SET status = N'FAILED'
WHERE status = N'SUPERSEDED';
GO

ALTER TABLE dbo.absence_workday_sync_jobs WITH NOCHECK
ADD CONSTRAINT CK_absence_workday_sync_jobs_status CHECK (
    status IN (N'PENDING', N'PROCESSING', N'COMPLETED', N'FAILED')
);
GO

-- Restore pre-070 operation constraint after removing MANUAL_RECONCILE rows if any.
UPDATE dbo.absence_workday_sync_jobs
SET operation = N'APPROVE'
WHERE operation = N'MANUAL_RECONCILE';
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_workday_sync_jobs_operation'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs DROP CONSTRAINT CK_absence_workday_sync_jobs_operation;
END;
GO

ALTER TABLE dbo.absence_workday_sync_jobs WITH NOCHECK
ADD CONSTRAINT CK_absence_workday_sync_jobs_operation CHECK (
    operation IN (
        N'APPROVE',
        N'AUTO_APPROVE',
        N'REJECT',
        N'CANCEL',
        N'RESUBMIT_AUTO_APPROVE'
    )
);
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'superseded_at'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs DROP COLUMN superseded_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'expected_operational_impact_version'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs DROP CONSTRAINT DF_awsj_expected_op_version;
    ALTER TABLE dbo.absence_workday_sync_jobs DROP COLUMN expected_operational_impact_version;
END;
GO
