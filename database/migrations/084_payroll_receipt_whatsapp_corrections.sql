/*
  Migration: 084_payroll_receipt_whatsapp_corrections.sql
  Purpose:
    - Harden payroll WhatsApp notification outbox (send attempts, cancel race, statuses)
    - Extend whatsapp_messages.message_type with DOCUMENT
    - Ensure employees(id, company_id) unique exists (precondition for FK from 083)
  Rollback: database/migrations/rollback/084_payroll_receipt_whatsapp_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

-- Precondition: composite unique on employees (id, company_id)
IF OBJECT_ID(N'dbo.employees', N'U') IS NOT NULL
   AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employees_id_company'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    CREATE UNIQUE INDEX UQ_employees_id_company
        ON dbo.employees (id, company_id);
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications', N'U') IS NULL
BEGIN
    THROW 50084, 'Precondition failed: whatsapp_payroll_receipt_notifications missing (apply 083 first)', 1;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_payroll_receipt_notifications', N'cancel_requested_at') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_notifications
        ADD cancel_requested_at DATETIME2 NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_payroll_receipt_notifications', N'provider_status') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_notifications
        ADD provider_status NVARCHAR(40) NULL;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_payroll_receipt_notifications', N'active_send_attempt_id') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_notifications
        ADD active_send_attempt_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_wprn_id_company'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_wprn_id_company
        ON dbo.whatsapp_payroll_receipt_notifications (id, company_id);
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_wprn_status'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_payroll_receipt_notifications DROP CONSTRAINT CK_wprn_status;
END;
GO

UPDATE dbo.whatsapp_payroll_receipt_notifications
SET status = N'SEND_ACCEPTED',
    updated_at = SYSUTCDATETIME()
WHERE status = N'SENT';
GO

ALTER TABLE dbo.whatsapp_payroll_receipt_notifications
    ADD CONSTRAINT CK_wprn_status
    CHECK (status IN (
        N'PENDING',
        N'PROCESSING',
        N'SEND_STARTED',
        N'SEND_ACCEPTED',
        N'FAILED',
        N'CANCELLED',
        N'RECONCILIATION_REQUIRED',
        N'SENT_RECOVERY_REQUIRED'
    ));
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notification_send_attempts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_payroll_receipt_notification_send_attempts (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_wprn_send_attempts PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        notification_id UNIQUEIDENTIFIER NOT NULL,
        attempt_number INT NOT NULL,
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_wprnsa_status DEFAULT N'STARTED',
        provider_message_sid NVARCHAR(100) NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        started_at DATETIME2 NOT NULL
            CONSTRAINT DF_wprnsa_started DEFAULT SYSUTCDATETIME(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wprnsa_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wprnsa_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wprnsa_notification_company
            FOREIGN KEY (notification_id, company_id)
            REFERENCES dbo.whatsapp_payroll_receipt_notifications (id, company_id),
        CONSTRAINT CK_wprnsa_status CHECK (status IN (
            N'STARTED',
            N'PROVIDER_ACCEPTED',
            N'PROVIDER_FAILED',
            N'AMBIGUOUS'
        )),
        CONSTRAINT CK_wprnsa_attempt_number CHECK (attempt_number >= 1)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_wprnsa_notification_attempt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notification_send_attempts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_wprnsa_notification_attempt
        ON dbo.whatsapp_payroll_receipt_notification_send_attempts (notification_id, attempt_number);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprnsa_provider_message_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notification_send_attempts')
)
BEGIN
    CREATE INDEX IX_wprnsa_provider_message_sid
        ON dbo.whatsapp_payroll_receipt_notification_send_attempts (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_whatsapp_messages_message_type'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_messages')
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages DROP CONSTRAINT CK_whatsapp_messages_message_type;
END;
GO

ALTER TABLE dbo.whatsapp_messages
    ADD CONSTRAINT CK_whatsapp_messages_message_type
    CHECK (message_type IN (N'TEXT', N'LOCATION', N'UNKNOWN', N'DOCUMENT'));
GO
