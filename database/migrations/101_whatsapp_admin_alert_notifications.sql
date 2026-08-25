/*
  Migration: 101_whatsapp_admin_alert_notifications.sql
  Purpose:
    - Durable outbox for WhatsApp admin alerts (lease claim, send attempts, dedupe).
    - Idempotency: UNIQUE (company_id, deduplication_key, recipient_id).
  Preconditions:
    - company_alert_recipients (100)
  Rollback: database/migrations/rollback/101_whatsapp_admin_alert_notifications_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_alert_recipients', N'U') IS NULL
BEGIN
    THROW 50101, 'Precondition failed: company_alert_recipients missing (apply 100 first)', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_car_id_company'
      AND object_id = OBJECT_ID(N'dbo.company_alert_recipients')
)
BEGIN
    THROW 50101, 'Precondition failed: UQ_car_id_company missing', 1;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_admin_alert_notifications (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_waan PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        recipient_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NULL,
        operation_id UNIQUEIDENTIFIER NULL,
        absence_request_id UNIQUEIDENTIFIER NULL,
        alert_type NVARCHAR(60) NOT NULL,
        severity NVARCHAR(20) NOT NULL
            CONSTRAINT DF_waan_severity DEFAULT N'INFO',
        template_category NVARCHAR(20) NOT NULL,
        deduplication_key NVARCHAR(200) NOT NULL,
        recipient_phone NVARCHAR(20) NOT NULL,
        content_variables_json NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_waan_status DEFAULT N'PENDING',
        attempt_count INT NOT NULL
            CONSTRAINT DF_waan_attempt_count DEFAULT 0,
        next_attempt_at DATETIME2 NULL,
        lease_owner NVARCHAR(100) NULL,
        lease_expires_at DATETIME2 NULL,
        provider_message_sid NVARCHAR(100) NULL,
        provider_status NVARCHAR(40) NULL,
        active_send_attempt_id UNIQUEIDENTIFIER NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        occurred_at DATETIME2 NOT NULL
            CONSTRAINT DF_waan_occurred_at DEFAULT SYSUTCDATETIME(),
        sent_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_waan_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_waan_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_waan_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_waan_recipient_company
            FOREIGN KEY (recipient_id, company_id)
            REFERENCES dbo.company_alert_recipients (id, company_id),
        CONSTRAINT CK_waan_template_category
            CHECK (template_category IN (N'OPERATIONAL', N'REQUEST', N'SECURITY')),
        CONSTRAINT CK_waan_alert_type
            CHECK (alert_type IN (
                N'EMPLOYEE_UNAVAILABLE',
                N'MISSING_CHECKIN_AFTER_OPERATION',
                N'FORWARDED_LOCATION_REJECTED'
            )),
        CONSTRAINT CK_waan_severity
            CHECK (severity IN (N'INFO', N'WARNING', N'CRITICAL')),
        CONSTRAINT CK_waan_status
            CHECK (status IN (
                N'PENDING',
                N'PROCESSING',
                N'SEND_STARTED',
                N'SEND_ACCEPTED',
                N'FAILED',
                N'CANCELLED',
                N'SKIPPED',
                N'RECONCILIATION_REQUIRED',
                N'SENT_RECOVERY_REQUIRED'
            )),
        CONSTRAINT CK_waan_attempt_count CHECK (attempt_count >= 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_waan_company_dedup_recipient'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_waan_company_dedup_recipient
        ON dbo.whatsapp_admin_alert_notifications (company_id, deduplication_key, recipient_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_waan_id_company'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_waan_id_company
        ON dbo.whatsapp_admin_alert_notifications (id, company_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_waan_status_next_attempt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    CREATE INDEX IX_waan_status_next_attempt
        ON dbo.whatsapp_admin_alert_notifications (status, next_attempt_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_waan_lease_expires'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    CREATE INDEX IX_waan_lease_expires
        ON dbo.whatsapp_admin_alert_notifications (lease_expires_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_waan_provider_message_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    CREATE UNIQUE INDEX IX_waan_provider_message_sid
        ON dbo.whatsapp_admin_alert_notifications (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notification_send_attempts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_admin_alert_notification_send_attempts (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_waansa PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        notification_id UNIQUEIDENTIFIER NOT NULL,
        attempt_number INT NOT NULL,
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_waansa_status DEFAULT N'STARTED',
        provider_message_sid NVARCHAR(100) NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        started_at DATETIME2 NOT NULL
            CONSTRAINT DF_waansa_started DEFAULT SYSUTCDATETIME(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_waansa_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_waansa_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_waansa_notification_company
            FOREIGN KEY (notification_id, company_id)
            REFERENCES dbo.whatsapp_admin_alert_notifications (id, company_id),
        CONSTRAINT CK_waansa_status CHECK (status IN (
            N'STARTED',
            N'PROVIDER_ACCEPTED',
            N'PROVIDER_FAILED',
            N'AMBIGUOUS'
        )),
        CONSTRAINT CK_waansa_attempt_number CHECK (attempt_number >= 1)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_waansa_notification_attempt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notification_send_attempts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_waansa_notification_attempt
        ON dbo.whatsapp_admin_alert_notification_send_attempts (notification_id, attempt_number);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_waansa_provider_message_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notification_send_attempts')
)
BEGIN
    CREATE INDEX IX_waansa_provider_message_sid
        ON dbo.whatsapp_admin_alert_notification_send_attempts (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO
