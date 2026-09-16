/*
  Migration: 134_daily_attendance_report.sql

  Phase 1: daily attendance email report for company admins.
  - company_settings: daily_attendance_report_enabled (default 0), daily_attendance_report_time
  - company_report_email_recipients (separate from WhatsApp phone recipients)
  - company_daily_attendance_report_runs (UQ company_id + report_date) with immutable email snapshot
  - company_daily_attendance_report_deliveries (UQ report_run_id + recipient_id)
  - Composite FKs (run/recipient, company_id) for multi-tenant isolation
  - FAILED_TERMINAL delivery status for non-retryable failures (console/disabled/max attempts)

  Does NOT change admin WhatsApp alert flags or employee reminder tables.

  IMPORTANT: ADD COLUMN in its own GO batch before FK/index references.
  Do not nest T-SQL BEGIN TRANSACTION (Node TDS TX owns atomicity).

  Rollback: rollback/134_daily_attendance_report_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NULL
BEGIN
    THROW 50134, 'Precondition failed: company_settings missing', 1;
END;
GO

IF COL_LENGTH(N'dbo.company_settings', N'daily_attendance_report_enabled') IS NULL
BEGIN
    ALTER TABLE dbo.company_settings
        ADD daily_attendance_report_enabled BIT NOT NULL
            CONSTRAINT DF_cs_daily_attendance_report_enabled DEFAULT 0;
END;
GO

IF COL_LENGTH(N'dbo.company_settings', N'daily_attendance_report_time') IS NULL
BEGIN
    ALTER TABLE dbo.company_settings
        ADD daily_attendance_report_time TIME(0) NOT NULL
            CONSTRAINT DF_cs_daily_attendance_report_time DEFAULT '08:00:00';
END;
GO

IF OBJECT_ID(N'dbo.company_report_email_recipients', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.company_report_email_recipients (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_report_email_recipients PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        email NVARCHAR(320) NOT NULL,
        display_name NVARCHAR(200) NULL,
        is_enabled BIT NOT NULL
            CONSTRAINT DF_crer_is_enabled DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_crer_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_crer_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_crer_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_crer_company_email_active'
      AND object_id = OBJECT_ID(N'dbo.company_report_email_recipients')
)
BEGIN
    CREATE UNIQUE INDEX UQ_crer_company_email_active
        ON dbo.company_report_email_recipients (company_id, email)
        WHERE is_enabled = 1;
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
    WHERE name = N'IX_crer_company_enabled'
      AND object_id = OBJECT_ID(N'dbo.company_report_email_recipients')
)
BEGIN
    CREATE INDEX IX_crer_company_enabled
        ON dbo.company_report_email_recipients (company_id, is_enabled);
END;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_runs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.company_daily_attendance_report_runs (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_daily_attendance_report_runs PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        report_date DATE NOT NULL,
        timezone_id NVARCHAR(80) NOT NULL,
        report_time_local TIME(0) NOT NULL,
        status NVARCHAR(40) NOT NULL
            CONSTRAINT DF_cdarr_status DEFAULT N'PENDING',
        recipient_count INT NOT NULL
            CONSTRAINT DF_cdarr_recipient_count DEFAULT 0,
        operations_count INT NOT NULL
            CONSTRAINT DF_cdarr_operations_count DEFAULT 0,
        scheduled_employees_count INT NOT NULL
            CONSTRAINT DF_cdarr_scheduled_employees DEFAULT 0,
        present_count INT NOT NULL
            CONSTRAINT DF_cdarr_present_count DEFAULT 0,
        checkin_count INT NOT NULL
            CONSTRAINT DF_cdarr_checkin_count DEFAULT 0,
        checkout_count INT NOT NULL
            CONSTRAINT DF_cdarr_checkout_count DEFAULT 0,
        late_count INT NOT NULL
            CONSTRAINT DF_cdarr_late_count DEFAULT 0,
        early_leave_count INT NOT NULL
            CONSTRAINT DF_cdarr_early_leave_count DEFAULT 0,
        unavailable_count INT NOT NULL
            CONSTRAINT DF_cdarr_unavailable_count DEFAULT 0,
        justified_count INT NOT NULL
            CONSTRAINT DF_cdarr_justified_count DEFAULT 0,
        pending_confirmation_count INT NOT NULL
            CONSTRAINT DF_cdarr_pending_confirmation DEFAULT 0,
        missing_checkin_count INT NOT NULL
            CONSTRAINT DF_cdarr_missing_checkin DEFAULT 0,
        missing_checkout_count INT NOT NULL
            CONSTRAINT DF_cdarr_missing_checkout DEFAULT 0,
        incomplete_count INT NOT NULL
            CONSTRAINT DF_cdarr_incomplete_count DEFAULT 0,
        total_incident_count INT NOT NULL
            CONSTRAINT DF_cdarr_total_incident_count DEFAULT 0,
        template_version NVARCHAR(40) NULL,
        email_subject_snapshot NVARCHAR(500) NULL,
        email_text_snapshot NVARCHAR(MAX) NULL,
        email_html_snapshot NVARCHAR(MAX) NULL,
        evaluated_at DATETIME2 NULL,
        attempt_count INT NOT NULL
            CONSTRAINT DF_cdarr_attempt_count DEFAULT 0,
        next_attempt_at DATETIME2 NULL,
        lease_owner NVARCHAR(100) NULL,
        lease_expires_at DATETIME2 NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        generated_at DATETIME2 NULL,
        started_at DATETIME2 NULL,
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_cdarr_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_cdarr_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_cdarr_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT CK_cdarr_status CHECK (
            status IN (
                N'PENDING', N'PROCESSING', N'SENT', N'PARTIAL', N'FAILED',
                N'SKIPPED_NO_RECIPIENTS', N'SKIPPED_NO_ACTIVITY'
            )
        ),
        CONSTRAINT UQ_cdarr_company_report_date UNIQUE (company_id, report_date)
    );
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

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_cdarr_claim'
      AND object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_runs')
)
BEGIN
    CREATE INDEX IX_cdarr_claim
        ON dbo.company_daily_attendance_report_runs (status, next_attempt_at, lease_expires_at)
        INCLUDE (company_id, report_date, attempt_count, generated_at);
END;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.company_daily_attendance_report_deliveries (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_daily_attendance_report_deliveries PRIMARY KEY
            DEFAULT NEWID(),
        report_run_id UNIQUEIDENTIFIER NOT NULL,
        company_id UNIQUEIDENTIFIER NOT NULL,
        recipient_id UNIQUEIDENTIFIER NOT NULL,
        email_snapshot NVARCHAR(320) NOT NULL,
        display_name_snapshot NVARCHAR(200) NULL,
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_cdard_status DEFAULT N'PENDING',
        attempt_count INT NOT NULL
            CONSTRAINT DF_cdard_attempt_count DEFAULT 0,
        next_attempt_at DATETIME2 NULL,
        lease_owner NVARCHAR(100) NULL,
        lease_expires_at DATETIME2 NULL,
        provider_message_id NVARCHAR(200) NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        processed_at DATETIME2 NULL,
        sent_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_cdard_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_cdard_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_cdard_run_company
            FOREIGN KEY (report_run_id, company_id)
            REFERENCES dbo.company_daily_attendance_report_runs (id, company_id),
        CONSTRAINT FK_cdard_recipient_company
            FOREIGN KEY (recipient_id, company_id)
            REFERENCES dbo.company_report_email_recipients (id, company_id),
        CONSTRAINT CK_cdard_status CHECK (
            status IN (N'PENDING', N'PROCESSING', N'SENT', N'FAILED', N'FAILED_TERMINAL')
        ),
        CONSTRAINT UQ_cdard_run_recipient UNIQUE (report_run_id, recipient_id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_cdard_claim'
      AND object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    CREATE INDEX IX_cdard_claim
        ON dbo.company_daily_attendance_report_deliveries (status, next_attempt_at, lease_expires_at)
        INCLUDE (report_run_id, company_id, attempt_count);
END;
GO
