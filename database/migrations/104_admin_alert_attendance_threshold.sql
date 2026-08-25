/*
  Migration: 104_admin_alert_attendance_threshold.sql
  Purpose (Phase D):
    - Company settings for attendance threshold alerts (off by default).
    - Persistent per-employee alert band/crossing state.
    - Durable dirty evaluation queue (lease claim).
    - Extend CK_waan_alert_type with ATTENDANCE_THRESHOLD_CROSSED.
  Preconditions:
    - 103_admin_alert_outbox_constraints.sql
    - UQ_employees_id_company
  Rollback: database/migrations/rollback/104_admin_alert_attendance_threshold_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NULL
BEGIN
    THROW 50104, 'Precondition failed: company_settings missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_employees_id_company'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    THROW 50104, 'Precondition failed: UQ_employees_id_company missing', 1;
END;
GO

/* ---- company_settings columns ---- */

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'attendance_threshold_alerts_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD attendance_threshold_alerts_enabled BIT NOT NULL
            CONSTRAINT DF_cs_attendance_threshold_alerts_enabled DEFAULT (0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'attendance_alert_threshold_percent'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD attendance_alert_threshold_percent INT NOT NULL
            CONSTRAINT DF_cs_attendance_alert_threshold_percent DEFAULT (80);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'attendance_alert_window_days'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD attendance_alert_window_days INT NOT NULL
            CONSTRAINT DF_cs_attendance_alert_window_days DEFAULT (30);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'attendance_alert_minimum_workdays'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD attendance_alert_minimum_workdays INT NOT NULL
            CONSTRAINT DF_cs_attendance_alert_minimum_workdays DEFAULT (5);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'attendance_alert_cooldown_days'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD attendance_alert_cooldown_days INT NOT NULL
            CONSTRAINT DF_cs_attendance_alert_cooldown_days DEFAULT (7);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'attendance_alert_config_version'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD attendance_alert_config_version INT NOT NULL
            CONSTRAINT DF_cs_attendance_alert_config_version DEFAULT (0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cs_attendance_alert_threshold_percent'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT CK_cs_attendance_alert_threshold_percent
            CHECK (attendance_alert_threshold_percent BETWEEN 1 AND 100);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cs_attendance_alert_window_days'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT CK_cs_attendance_alert_window_days
            CHECK (attendance_alert_window_days BETWEEN 7 AND 365);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cs_attendance_alert_minimum_workdays'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT CK_cs_attendance_alert_minimum_workdays
            CHECK (attendance_alert_minimum_workdays BETWEEN 1 AND 100);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cs_attendance_alert_cooldown_days'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT CK_cs_attendance_alert_cooldown_days
            CHECK (attendance_alert_cooldown_days BETWEEN 1 AND 90);
END;
GO

/* ---- employee_attendance_alert_state ---- */

IF OBJECT_ID(N'dbo.employee_attendance_alert_state', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.employee_attendance_alert_state (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_eaas PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        current_band NVARCHAR(40) NOT NULL,
        last_rate DECIMAL(7, 3) NULL,
        last_present_workdays INT NOT NULL
            CONSTRAINT DF_eaas_last_present DEFAULT (0),
        last_absent_workdays INT NOT NULL
            CONSTRAINT DF_eaas_last_absent DEFAULT (0),
        last_evaluated_workdays INT NOT NULL
            CONSTRAINT DF_eaas_last_evaluated DEFAULT (0),
        last_evaluated_at DATETIME2 NOT NULL
            CONSTRAINT DF_eaas_last_evaluated_at DEFAULT SYSUTCDATETIME(),
        last_crossed_below_at DATETIME2 NULL,
        last_alerted_at DATETIME2 NULL,
        crossing_sequence INT NOT NULL
            CONSTRAINT DF_eaas_crossing_sequence DEFAULT (0),
        pending_alert_crossing_sequence INT NULL,
        pending_alert_occurred_at DATETIME2 NULL,
        pending_alert_rate DECIMAL(7, 3) NULL,
        pending_alert_evaluated_workdays INT NULL,
        config_version INT NOT NULL
            CONSTRAINT DF_eaas_config_version DEFAULT (0),
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_eaas_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_eaas_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_eaas_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_eaas_employee_company
            FOREIGN KEY (employee_id, company_id)
            REFERENCES dbo.employees (id, company_id),
        CONSTRAINT UQ_eaas_company_employee UNIQUE (company_id, employee_id),
        CONSTRAINT CK_eaas_current_band
            CHECK (current_band IN (
                N'ABOVE_OR_EQUAL',
                N'BELOW',
                N'INSUFFICIENT_SAMPLE'
            )),
        CONSTRAINT CK_eaas_crossing_sequence CHECK (crossing_sequence >= 0),
        CONSTRAINT CK_eaas_counts CHECK (
            last_present_workdays >= 0
            AND last_absent_workdays >= 0
            AND last_evaluated_workdays >= 0
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_eaas_pending_alert'
      AND object_id = OBJECT_ID(N'dbo.employee_attendance_alert_state')
)
BEGIN
    CREATE INDEX IX_eaas_pending_alert
        ON dbo.employee_attendance_alert_state (company_id, pending_alert_crossing_sequence)
        WHERE pending_alert_crossing_sequence IS NOT NULL;
END;
GO

/* ---- attendance_alert_evaluation_queue ---- */

IF OBJECT_ID(N'dbo.attendance_alert_evaluation_queue', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.attendance_alert_evaluation_queue (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_aaeq PRIMARY KEY
            DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        status NVARCHAR(20) NOT NULL
            CONSTRAINT DF_aaeq_status DEFAULT N'PENDING',
        attempt_count INT NOT NULL
            CONSTRAINT DF_aaeq_attempt_count DEFAULT (0),
        next_attempt_at DATETIME2 NULL,
        lease_owner NVARCHAR(100) NULL,
        lease_expires_at DATETIME2 NULL,
        last_error_code NVARCHAR(80) NULL,
        last_error_message NVARCHAR(1000) NULL,
        requested_at DATETIME2 NOT NULL
            CONSTRAINT DF_aaeq_requested_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_aaeq_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_aaeq_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_aaeq_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_aaeq_employee_company
            FOREIGN KEY (employee_id, company_id)
            REFERENCES dbo.employees (id, company_id),
        CONSTRAINT UQ_aaeq_company_employee UNIQUE (company_id, employee_id),
        CONSTRAINT CK_aaeq_status
            CHECK (status IN (N'PENDING', N'PROCESSING', N'FAILED')),
        CONSTRAINT CK_aaeq_attempt_count CHECK (attempt_count >= 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_aaeq_claim'
      AND object_id = OBJECT_ID(N'dbo.attendance_alert_evaluation_queue')
)
BEGIN
    CREATE INDEX IX_aaeq_claim
        ON dbo.attendance_alert_evaluation_queue (status, next_attempt_at, lease_expires_at);
END;
GO

/* ---- outbox alert_type CHECK ---- */

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NULL
BEGIN
    THROW 50104, 'Precondition failed: whatsapp_admin_alert_notifications missing', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_waan_alert_type'
      AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        DROP CONSTRAINT CK_waan_alert_type;
END;
GO

ALTER TABLE dbo.whatsapp_admin_alert_notifications
    ADD CONSTRAINT CK_waan_alert_type
        CHECK (alert_type IN (
            N'EMPLOYEE_UNAVAILABLE',
            N'MISSING_CHECKIN_AFTER_OPERATION',
            N'FORWARDED_LOCATION_REJECTED',
            N'ABSENCE_REQUEST_PENDING',
            N'ATTENDANCE_THRESHOLD_CROSSED'
        ));
GO
