/*
  Migration: 083_payroll_receipt_whatsapp_notifications.sql
  Purpose:
    - Outbox table for payroll receipt available WhatsApp notifications (lease claim)
    - Composite UNIQUE (id, company_id) on payroll_receipts for company-scoped FK
    - Bot session state WAITING_PAYROLL_RECEIPT_PERIOD
  Rollback: database/migrations/rollback/083_payroll_receipt_whatsapp_notifications_rollback.sql
*/

USE dinamic_attendance;
GO

-- Composite unique on payroll_receipts (id, company_id) for FK (payroll_receipt_id, company_id)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_pr_id_company'
      AND object_id = OBJECT_ID(N'dbo.payroll_receipts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_pr_id_company
        ON dbo.payroll_receipts (id, company_id);
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_payroll_receipt_notifications (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_payroll_receipt_notifications PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        payroll_receipt_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        notification_type NVARCHAR(40) NOT NULL
            CONSTRAINT DF_wprn_notification_type DEFAULT N'PAYROLL_RECEIPT_AVAILABLE',
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_wprn_status DEFAULT N'PENDING',
        attempt_count INT NOT NULL
            CONSTRAINT DF_wprn_attempt_count DEFAULT 0,
        next_attempt_at DATETIME2 NULL,
        lease_owner NVARCHAR(100) NULL,
        lease_expires_at DATETIME2 NULL,
        provider_message_sid NVARCHAR(100) NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        sent_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_wprn_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_wprn_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_wprn_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_wprn_receipt_company
            FOREIGN KEY (payroll_receipt_id, company_id)
            REFERENCES dbo.payroll_receipts (id, company_id),
        CONSTRAINT FK_wprn_employee_company
            FOREIGN KEY (employee_id, company_id)
            REFERENCES dbo.employees (id, company_id),
        CONSTRAINT CK_wprn_notification_type
            CHECK (notification_type IN (N'PAYROLL_RECEIPT_AVAILABLE')),
        CONSTRAINT CK_wprn_status
            CHECK (status IN (
                N'PENDING',
                N'PROCESSING',
                N'SENT',
                N'FAILED',
                N'CANCELLED',
                N'SENT_RECOVERY_REQUIRED'
            )),
        CONSTRAINT CK_wprn_attempt_count CHECK (attempt_count >= 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_wprn_company_receipt_type'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_wprn_company_receipt_type
        ON dbo.whatsapp_payroll_receipt_notifications (company_id, payroll_receipt_id, notification_type);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprn_status_next_attempt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
)
BEGIN
    CREATE INDEX IX_wprn_status_next_attempt
        ON dbo.whatsapp_payroll_receipt_notifications (status, next_attempt_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprn_lease_expires'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
)
BEGIN
    CREATE INDEX IX_wprn_lease_expires
        ON dbo.whatsapp_payroll_receipt_notifications (lease_expires_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprn_company_employee'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
)
BEGIN
    CREATE INDEX IX_wprn_company_employee
        ON dbo.whatsapp_payroll_receipt_notifications (company_id, employee_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wprn_provider_message_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications')
)
BEGIN
    CREATE UNIQUE INDEX IX_wprn_provider_message_sid
        ON dbo.whatsapp_payroll_receipt_notifications (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO

-- Extend bot_sessions state CHECK for payroll receipt conversational query
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID(N'dbo.bot_sessions')
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

ALTER TABLE dbo.bot_sessions
    ADD CONSTRAINT CK_bot_sessions_state
    CHECK (state IN (
        N'WAITING_LOCATION',
        N'WAITING_OPERATION_SELECTION',
        N'WAITING_CHECKOUT_LOCATION',
        N'WAITING_CHECKOUT_OPERATION_SELECTION',
        N'WAITING_ABSENCE_TYPE',
        N'WAITING_ABSENCE_START_DATE',
        N'WAITING_ABSENCE_END_DATE',
        N'WAITING_ABSENCE_REASON',
        N'WAITING_ABSENCE_CONFIRMATION',
        N'WAITING_CONFIRM_ATTENDANCE_SELECTION',
        N'WAITING_UNAVAILABILITY_SELECTION',
        N'WAITING_ATTENDANCE_CONFIRMATION_RESPONSE',
        N'WAITING_PAYROLL_RECEIPT_PERIOD',
        N'COMPLETED',
        N'CANCELLED',
        N'EXPIRED'
    ));
GO
