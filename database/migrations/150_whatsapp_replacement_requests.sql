/* Occurrence-scoped WhatsApp replacement workflow. */
USE dinamic_attendance;
GO

-- Absence confirmation for a replacement is occurrence-scoped. Do not use a
-- recurring operation_assignment confirmation as the source of truth.
IF COL_LENGTH(N'dbo.employee_workdays', N'unavailable_at') IS NULL
  ALTER TABLE dbo.employee_workdays ADD unavailable_at DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_employee_workdays_unavailable' AND object_id=OBJECT_ID(N'dbo.employee_workdays'))
  CREATE INDEX IX_employee_workdays_unavailable ON dbo.employee_workdays(company_id, unavailable_at) WHERE unavailable_at IS NOT NULL;
GO

-- Required candidate key for the tenant-scoped recipient FK below.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_company_alert_recipients_company_id' AND object_id=OBJECT_ID(N'dbo.company_alert_recipients'))
  CREATE UNIQUE INDEX UQ_company_alert_recipients_company_id ON dbo.company_alert_recipients(company_id, id);
GO

IF OBJECT_ID(N'dbo.replacement_requests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.replacement_requests (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_replacement_requests PRIMARY KEY DEFAULT NEWID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    operation_workday_id UNIQUEIDENTIFIER NOT NULL,
    absent_employee_workday_id UNIQUEIDENTIFIER NOT NULL,
    absent_employee_id UNIQUEIDENTIFIER NOT NULL,
    root_request_id UNIQUEIDENTIFIER NULL,
    parent_request_id UNIQUEIDENTIFIER NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_replacement_requests_status DEFAULT N'PENDING',
    request_version INT NOT NULL CONSTRAINT DF_replacement_requests_version DEFAULT 1,
    candidates_materialized_at DATETIME2 NULL,
    notifications_materialized_at DATETIME2 NULL,
    resolved_employee_id UNIQUEIDENTIFIER NULL,
    resolved_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_replacement_requests_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_replacement_requests_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_replacement_requests_company FOREIGN KEY (company_id) REFERENCES dbo.companies(id),
    CONSTRAINT FK_replacement_requests_workday FOREIGN KEY (company_id, operation_workday_id) REFERENCES dbo.operation_workdays(company_id, id),
    CONSTRAINT FK_replacement_requests_absent_workday FOREIGN KEY (company_id, absent_employee_workday_id) REFERENCES dbo.employee_workdays(company_id, id),
    CONSTRAINT FK_replacement_requests_absent_employee FOREIGN KEY (company_id, absent_employee_id) REFERENCES dbo.employees(company_id, id),
    CONSTRAINT UQ_replacement_requests_company_id UNIQUE (company_id, id),
    CONSTRAINT FK_replacement_requests_root FOREIGN KEY (company_id, root_request_id) REFERENCES dbo.replacement_requests(company_id, id),
    CONSTRAINT FK_replacement_requests_parent FOREIGN KEY (company_id, parent_request_id) REFERENCES dbo.replacement_requests(company_id, id),
    CONSTRAINT CK_replacement_requests_status CHECK (status IN (N'PENDING',N'COVERED',N'EXPIRED',N'FAILED')),
    CONSTRAINT CK_replacement_requests_version CHECK (request_version >= 1),
    CONSTRAINT CK_replacement_requests_resolution CHECK ((status = N'COVERED' AND resolved_employee_id IS NOT NULL AND resolved_at IS NOT NULL) OR (status <> N'COVERED'))
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_replacement_requests_absent_workday_pending' AND object_id=OBJECT_ID(N'dbo.replacement_requests'))
  CREATE UNIQUE INDEX UQ_replacement_requests_absent_workday_pending ON dbo.replacement_requests(company_id, absent_employee_workday_id) WHERE status = N'PENDING';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_replacement_requests_workday_status' AND object_id=OBJECT_ID(N'dbo.replacement_requests'))
  CREATE INDEX IX_replacement_requests_workday_status ON dbo.replacement_requests(company_id, operation_workday_id, status);
GO

IF OBJECT_ID(N'dbo.replacement_request_candidates', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.replacement_request_candidates (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_replacement_request_candidates PRIMARY KEY DEFAULT NEWID(),
    request_id UNIQUEIDENTIFIER NOT NULL,
    company_id UNIQUEIDENTIFIER NOT NULL,
    employee_id UNIQUEIDENTIFIER NOT NULL,
    rank INT NOT NULL,
    score DECIMAL(9,6) NULL,
    reasons_json NVARCHAR(MAX) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_replacement_candidate_status DEFAULT N'OFFERED',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_replacement_candidates_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_replacement_candidates_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_replacement_candidates_request FOREIGN KEY (company_id, request_id) REFERENCES dbo.replacement_requests(company_id, id),
    CONSTRAINT FK_replacement_candidates_employee FOREIGN KEY (company_id, employee_id) REFERENCES dbo.employees(company_id, id),
    CONSTRAINT CK_replacement_candidate_rank CHECK (rank BETWEEN 1 AND 3),
    CONSTRAINT CK_replacement_candidate_status CHECK (status IN (N'OFFERED',N'SELECTED',N'REJECTED',N'STALE'))
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_replacement_candidate_request_rank' AND object_id=OBJECT_ID(N'dbo.replacement_request_candidates'))
  CREATE UNIQUE INDEX UQ_replacement_candidate_request_rank ON dbo.replacement_request_candidates(request_id, rank);
GO

IF OBJECT_ID(N'dbo.replacement_request_notifications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.replacement_request_notifications (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_replacement_request_notifications PRIMARY KEY DEFAULT NEWID(),
    company_id UNIQUEIDENTIFIER NOT NULL,
    request_id UNIQUEIDENTIFIER NOT NULL,
    recipient_id UNIQUEIDENTIFIER NOT NULL,
    notification_id UNIQUEIDENTIFIER NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_replacement_notifications_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_replacement_notifications_request FOREIGN KEY(company_id, request_id) REFERENCES dbo.replacement_requests(company_id, id),
    CONSTRAINT FK_replacement_notifications_recipient FOREIGN KEY(company_id, recipient_id) REFERENCES dbo.company_alert_recipients(company_id, id),
    CONSTRAINT FK_replacement_notifications_outbox FOREIGN KEY(notification_id, company_id) REFERENCES dbo.whatsapp_admin_alert_notifications(id, company_id),
    CONSTRAINT UQ_replacement_notifications_request_recipient UNIQUE(request_id, recipient_id),
    CONSTRAINT UQ_replacement_notifications_outbox UNIQUE(notification_id)
  );
END;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_waan_alert_type' AND parent_object_id=OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications'))
BEGIN
  ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP CONSTRAINT CK_waan_alert_type;
END;
GO
ALTER TABLE dbo.whatsapp_admin_alert_notifications ADD CONSTRAINT CK_waan_alert_type CHECK (alert_type IN (
 N'EMPLOYEE_UNAVAILABLE',N'MISSING_CHECKIN_AFTER_OPERATION',N'FORWARDED_LOCATION_REJECTED',N'ABSENCE_REQUEST_PENDING',N'ATTENDANCE_THRESHOLD_CROSSED',N'ATTENDANCE_CONFIRMATION_MISSING',N'MISSING_CHECKIN_AFTER_START',N'MISSING_CHECKOUT_AFTER_END',N'REPLACEMENT_REQUEST'));
GO
