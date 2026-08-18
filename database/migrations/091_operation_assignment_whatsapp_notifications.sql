/*
  Migration: 091_operation_assignment_whatsapp_notifications.sql
  Purpose:
    - Outbox table for ONE_TIME operation assignment WhatsApp notifications
      (EVENTUAL_OPERATION_ASSIGNED), mirroring the hardened payroll receipt
      notification outbox (lease claim, send attempts, cancel race, statuses).
    - Idempotency key: UNIQUE (company_id, operation_assignment_id, notification_type).
  Preconditions (already applied by prior migrations):
    - UQ_operation_assignments_company_id ON operation_assignments (company_id, id) — 087
    - UQ_scheduled_operations_company_id ON scheduled_operations (company_id, id) — 039
    - UQ_employees_id_company ON employees (id, company_id) — 084
  Rollback: database/migrations/rollback/091_operation_assignment_whatsapp_notifications_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.operation_assignments', N'U') IS NULL
BEGIN
    THROW 50091, 'Precondition failed: operation_assignments missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_operation_assignments_company_id'
      AND object_id = OBJECT_ID(N'dbo.operation_assignments')
)
BEGIN
    THROW 50091, 'Precondition failed: UQ_operation_assignments_company_id missing (apply 087 first)', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employees_id_company'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    THROW 50091, 'Precondition failed: UQ_employees_id_company missing (apply 084 first)', 1;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_operation_assignment_notifications (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_whatsapp_operation_assignment_notifications PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_assignment_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        notification_type NVARCHAR(40) NOT NULL
            CONSTRAINT DF_woan_notification_type DEFAULT N'EVENTUAL_OPERATION_ASSIGNED',
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_woan_status DEFAULT N'PENDING',
        attempt_count INT NOT NULL
            CONSTRAINT DF_woan_attempt_count DEFAULT 0,
        next_attempt_at DATETIME2 NULL,
        lease_owner NVARCHAR(100) NULL,
        lease_expires_at DATETIME2 NULL,
        provider_message_sid NVARCHAR(100) NULL,
        provider_status NVARCHAR(40) NULL,
        cancel_requested_at DATETIME2 NULL,
        active_send_attempt_id UNIQUEIDENTIFIER NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        sent_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_woan_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_woan_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_woan_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_woan_assignment_company
            FOREIGN KEY (company_id, operation_assignment_id)
            REFERENCES dbo.operation_assignments (company_id, id),
        CONSTRAINT FK_woan_operation_company
            FOREIGN KEY (company_id, operation_id)
            REFERENCES dbo.scheduled_operations (company_id, id),
        CONSTRAINT FK_woan_employee_company
            FOREIGN KEY (employee_id, company_id)
            REFERENCES dbo.employees (id, company_id),
        CONSTRAINT CK_woan_notification_type
            CHECK (notification_type IN (N'EVENTUAL_OPERATION_ASSIGNED')),
        CONSTRAINT CK_woan_status
            CHECK (status IN (
                N'PENDING',
                N'PROCESSING',
                N'SEND_STARTED',
                N'SEND_ACCEPTED',
                N'FAILED',
                N'CANCELLED',
                N'RECONCILIATION_REQUIRED',
                N'SENT_RECOVERY_REQUIRED'
            )),
        CONSTRAINT CK_woan_attempt_count CHECK (attempt_count >= 0)
    );
END;
GO

-- Idempotency key: one EVENTUAL_OPERATION_ASSIGNED row per assignment.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_woan_company_assignment_type'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_woan_company_assignment_type
        ON dbo.whatsapp_operation_assignment_notifications (company_id, operation_assignment_id, notification_type);
END;
GO

-- Composite unique for FK from send_attempts table.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_woan_id_company'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_woan_id_company
        ON dbo.whatsapp_operation_assignment_notifications (id, company_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_woan_status_next_attempt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications')
)
BEGIN
    CREATE INDEX IX_woan_status_next_attempt
        ON dbo.whatsapp_operation_assignment_notifications (status, next_attempt_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_woan_lease_expires'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications')
)
BEGIN
    CREATE INDEX IX_woan_lease_expires
        ON dbo.whatsapp_operation_assignment_notifications (lease_expires_at);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_woan_company_employee'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications')
)
BEGIN
    CREATE INDEX IX_woan_company_employee
        ON dbo.whatsapp_operation_assignment_notifications (company_id, employee_id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_woan_provider_message_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications')
)
BEGIN
    CREATE UNIQUE INDEX IX_woan_provider_message_sid
        ON dbo.whatsapp_operation_assignment_notifications (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notification_send_attempts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_operation_assignment_notification_send_attempts (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_woan_send_attempts PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        notification_id UNIQUEIDENTIFIER NOT NULL,
        attempt_number INT NOT NULL,
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_woansa_status DEFAULT N'STARTED',
        provider_message_sid NVARCHAR(100) NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        started_at DATETIME2 NOT NULL
            CONSTRAINT DF_woansa_started DEFAULT SYSUTCDATETIME(),
        finished_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_woansa_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_woansa_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_woansa_notification_company
            FOREIGN KEY (notification_id, company_id)
            REFERENCES dbo.whatsapp_operation_assignment_notifications (id, company_id),
        CONSTRAINT CK_woansa_status CHECK (status IN (
            N'STARTED',
            N'PROVIDER_ACCEPTED',
            N'PROVIDER_FAILED',
            N'AMBIGUOUS'
        )),
        CONSTRAINT CK_woansa_attempt_number CHECK (attempt_number >= 1)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_woansa_notification_attempt'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notification_send_attempts')
)
BEGIN
    CREATE UNIQUE INDEX UQ_woansa_notification_attempt
        ON dbo.whatsapp_operation_assignment_notification_send_attempts (notification_id, attempt_number);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_woansa_provider_message_sid'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_operation_assignment_notification_send_attempts')
)
BEGIN
    CREATE INDEX IX_woansa_provider_message_sid
        ON dbo.whatsapp_operation_assignment_notification_send_attempts (provider_message_sid)
        WHERE provider_message_sid IS NOT NULL;
END;
GO
