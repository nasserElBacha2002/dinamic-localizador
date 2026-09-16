/*
  Migration: 135_daily_attendance_report_corrections.sql

  Upgrades Phase 1 report schema for environments that already applied the
  initial 134 without snapshots / FAILED_TERMINAL / composite FKs.

  Safe no-op when 134 already created the corrected shape.

  Rollback: rollback/135_daily_attendance_report_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_runs', N'U') IS NULL
BEGIN
    THROW 50135, 'Precondition failed: company_daily_attendance_report_runs missing (apply 134 first)', 1;
END;
GO

IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'total_incident_count') IS NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_runs
        ADD total_incident_count INT NOT NULL
            CONSTRAINT DF_cdarr_total_incident_count DEFAULT 0;
END;
GO

IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'template_version') IS NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_runs
        ADD template_version NVARCHAR(40) NULL;
END;
GO

IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'email_subject_snapshot') IS NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_runs
        ADD email_subject_snapshot NVARCHAR(500) NULL;
END;
GO

IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'email_text_snapshot') IS NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_runs
        ADD email_text_snapshot NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'email_html_snapshot') IS NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_runs
        ADD email_html_snapshot NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', N'evaluated_at') IS NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_runs
        ADD evaluated_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_crer_id_company'
      AND object_id = OBJECT_ID(N'dbo.company_report_email_recipients')
)
BEGIN
    CREATE UNIQUE INDEX UQ_crer_id_company
        ON dbo.company_report_email_recipients (id, company_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_cdarr_id_company'
      AND object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_runs')
)
BEGIN
    CREATE UNIQUE INDEX UQ_cdarr_id_company
        ON dbo.company_daily_attendance_report_runs (id, company_id);
END;
GO

/* Widen delivery status check to include FAILED_TERMINAL */
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cdard_status'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries DROP CONSTRAINT CK_cdard_status;
END;
GO

ALTER TABLE dbo.company_daily_attendance_report_deliveries
    ADD CONSTRAINT CK_cdard_status CHECK (
        status IN (N'PENDING', N'PROCESSING', N'SENT', N'FAILED', N'FAILED_TERMINAL')
    );
GO

/* Replace single-column FKs with composite tenant FKs when legacy FKs exist */
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_run'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries DROP CONSTRAINT FK_cdard_run;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries DROP CONSTRAINT FK_cdard_company;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_recipient'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries DROP CONSTRAINT FK_cdard_recipient;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_run_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD CONSTRAINT FK_cdard_run_company
            FOREIGN KEY (report_run_id, company_id)
            REFERENCES dbo.company_daily_attendance_report_runs (id, company_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_recipient_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD CONSTRAINT FK_cdard_recipient_company
            FOREIGN KEY (recipient_id, company_id)
            REFERENCES dbo.company_report_email_recipients (id, company_id);
END;
GO
