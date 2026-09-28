/* Phase 2B: immutable monthly report snapshots and recipient deliveries. */
IF OBJECT_ID(N'dbo.monthly_attendance_report_runs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.monthly_attendance_report_runs (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_monthly_attendance_report_runs PRIMARY KEY DEFAULT NEWID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    report_year INT NOT NULL,
    report_month INT NOT NULL,
    timezone_snapshot NVARCHAR(80) NOT NULL,
    dataset_schema_version INT NOT NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_monthly_report_run_status DEFAULT N'PENDING',
    subject_snapshot NVARCHAR(500) NULL,
    text_snapshot NVARCHAR(MAX) NULL,
    html_snapshot NVARCHAR(MAX) NULL,
    xlsx_snapshot VARBINARY(MAX) NULL,
    attempt_count INT NOT NULL CONSTRAINT DF_monthly_report_run_attempt DEFAULT 0,
    next_attempt_at DATETIME2 NULL,
    lease_owner NVARCHAR(100) NULL,
    lease_expires_at DATETIME2 NULL,
    last_error NVARCHAR(1000) NULL,
    sent_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_monthly_report_run_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_monthly_report_run_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_monthly_report_run_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
    CONSTRAINT CK_monthly_report_run_month CHECK (report_month BETWEEN 1 AND 12),
    CONSTRAINT CK_monthly_report_run_status CHECK (status IN (N'PENDING',N'PROCESSING',N'SENT',N'PARTIAL',N'FAILED',N'SKIPPED_NO_RECIPIENTS'))
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_monthly_report_company_period' AND object_id = OBJECT_ID(N'dbo.monthly_attendance_report_runs'))
  CREATE UNIQUE INDEX UQ_monthly_report_company_period ON dbo.monthly_attendance_report_runs(company_id, report_year, report_month);
GO
IF OBJECT_ID(N'dbo.monthly_attendance_report_deliveries', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.monthly_attendance_report_deliveries (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_monthly_report_deliveries PRIMARY KEY DEFAULT NEWID(),
    report_run_id UNIQUEIDENTIFIER NOT NULL,
    company_id UNIQUEIDENTIFIER NOT NULL,
    recipient_id UNIQUEIDENTIFIER NULL,
    email_snapshot NVARCHAR(320) NOT NULL,
    display_name_snapshot NVARCHAR(200) NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_monthly_report_delivery_status DEFAULT N'PENDING',
    attempt_count INT NOT NULL CONSTRAINT DF_monthly_report_delivery_attempt DEFAULT 0,
    next_attempt_at DATETIME2 NULL,
    lease_owner NVARCHAR(100) NULL,
    lease_expires_at DATETIME2 NULL,
    provider_message_id NVARCHAR(200) NULL,
    last_error NVARCHAR(1000) NULL,
    sent_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_monthly_report_delivery_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_monthly_report_delivery_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_monthly_report_delivery_run FOREIGN KEY (report_run_id) REFERENCES dbo.monthly_attendance_report_runs(id),
    CONSTRAINT FK_monthly_report_delivery_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
    CONSTRAINT CK_monthly_report_delivery_status CHECK (status IN (N'PENDING',N'PROCESSING',N'SENT',N'FAILED',N'FAILED_TERMINAL'))
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_monthly_report_delivery_email' AND object_id = OBJECT_ID(N'dbo.monthly_attendance_report_deliveries'))
  CREATE UNIQUE INDEX UQ_monthly_report_delivery_email ON dbo.monthly_attendance_report_deliveries(report_run_id, email_snapshot);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_monthly_report_claim' AND object_id = OBJECT_ID(N'dbo.monthly_attendance_report_runs'))
  CREATE INDEX IX_monthly_report_claim ON dbo.monthly_attendance_report_runs(status, next_attempt_at, lease_expires_at);
GO
