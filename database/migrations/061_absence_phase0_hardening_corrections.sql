/*
  Migration: 061_absence_phase0_hardening_corrections.sql
  Purpose:
    - Overlap-friendly index on absence_requests
    - Durable workday reconciliation job table for absences
  Rollback:
    DROP INDEX IF EXISTS IX_absence_requests_overlap_lookup ON absence_requests;
    DROP TABLE IF EXISTS absence_workday_sync_jobs;
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_absence_requests_overlap_lookup'
      AND object_id = OBJECT_ID('dbo.absence_requests')
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_absence_requests_overlap_lookup
        ON dbo.absence_requests (company_id, employee_id, status, start_date, end_date)
        INCLUDE (id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'absence_workday_sync_jobs')
BEGIN
    CREATE TABLE absence_workday_sync_jobs (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_absence_workday_sync_jobs PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        absence_request_id UNIQUEIDENTIFIER NOT NULL,
        absence_status NVARCHAR(30) NOT NULL,
        operation NVARCHAR(40) NOT NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_absence_workday_sync_jobs_status DEFAULT 'PENDING',
        attempt_count INT NOT NULL CONSTRAINT DF_absence_workday_sync_jobs_attempt_count DEFAULT 0,
        last_error NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_absence_workday_sync_jobs_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_absence_workday_sync_jobs_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_absence_workday_sync_jobs_company FOREIGN KEY (company_id) REFERENCES companies (id),
        CONSTRAINT FK_absence_workday_sync_jobs_request FOREIGN KEY (absence_request_id) REFERENCES absence_requests (id),
        CONSTRAINT CK_absence_workday_sync_jobs_status CHECK (
            status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')
        ),
        CONSTRAINT CK_absence_workday_sync_jobs_operation CHECK (
            operation IN (
                'APPROVE',
                'AUTO_APPROVE',
                'REJECT',
                'CANCEL',
                'RESUBMIT_AUTO_APPROVE'
            )
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_absence_workday_sync_jobs_active'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    -- One active/pending job per request+operation (prevents duplicate enqueue).
    CREATE UNIQUE INDEX UQ_absence_workday_sync_jobs_active
        ON dbo.absence_workday_sync_jobs (company_id, absence_request_id, operation)
        WHERE status IN ('PENDING', 'PROCESSING');
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_absence_workday_sync_jobs_claim'
      AND object_id = OBJECT_ID('dbo.absence_workday_sync_jobs')
)
BEGIN
    CREATE INDEX IX_absence_workday_sync_jobs_claim
        ON dbo.absence_workday_sync_jobs (status, updated_at, attempt_count);
END;
GO
