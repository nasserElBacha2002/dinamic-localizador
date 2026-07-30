/*
  Migration: 070_absence_phase5_operational_corrections.sql
  Purpose:
    - Fence absence_workday_sync_jobs with expected operational impact version
    - Allow SUPERSEDED job status
    - Persist reconciliation status on absence_requests
  Rollback: database/migrations/rollback/070_absence_phase5_operational_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'expected_operational_impact_version'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs
        ADD expected_operational_impact_version INT NOT NULL
            CONSTRAINT DF_awsj_expected_op_version DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
      AND name = 'superseded_at'
)
BEGIN
    ALTER TABLE dbo.absence_workday_sync_jobs
        ADD superseded_at DATETIME2 NULL;
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

ALTER TABLE dbo.absence_workday_sync_jobs WITH NOCHECK
ADD CONSTRAINT CK_absence_workday_sync_jobs_status CHECK (
    status IN (N'PENDING', N'PROCESSING', N'COMPLETED', N'FAILED', N'SUPERSEDED')
);
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
        N'RESUBMIT_AUTO_APPROVE',
        N'MANUAL_RECONCILE'
    )
);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests')
      AND name = 'operational_reconciliation_status'
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD operational_reconciliation_status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_ar_op_recon_status DEFAULT N'NOT_APPLICABLE',
            operational_reconciliation_job_id UNIQUEIDENTIFIER NULL,
            operational_reconciliation_last_error NVARCHAR(1000) NULL,
            operational_reconciliation_updated_at DATETIME2 NULL;
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

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ar_op_recon_status'
)
BEGIN
    ALTER TABLE dbo.absence_requests WITH NOCHECK
    ADD CONSTRAINT CK_ar_op_recon_status CHECK (
        operational_reconciliation_status IN (
            N'NOT_APPLICABLE',
            N'PENDING',
            N'PROCESSING',
            N'PARTIALLY_APPLIED',
            N'APPLIED',
            N'FAILED',
            N'SUPERSEDED',
            N'REVERTED'
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_awsj_request_status_version'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    CREATE INDEX IX_awsj_request_status_version
        ON dbo.absence_workday_sync_jobs (
            company_id,
            absence_request_id,
            status,
            expected_operational_impact_version
        );
END;
GO
