USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'absence_types')
BEGIN
    CREATE TABLE absence_types (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_absence_types PRIMARY KEY DEFAULT NEWID(),
        code NVARCHAR(40) NOT NULL,
        name NVARCHAR(120) NOT NULL,
        description NVARCHAR(500) NULL,
        requires_approval BIT NOT NULL CONSTRAINT DF_absence_types_requires_approval DEFAULT 1,
        requires_attachment BIT NOT NULL CONSTRAINT DF_absence_types_requires_attachment DEFAULT 0,
        deducts_balance BIT NOT NULL CONSTRAINT DF_absence_types_deducts_balance DEFAULT 0,
        allows_half_day BIT NOT NULL CONSTRAINT DF_absence_types_allows_half_day DEFAULT 0,
        is_active BIT NOT NULL CONSTRAINT DF_absence_types_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_absence_types_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_absence_types_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_absence_types_code UNIQUE (code)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_absence_types_is_active' AND object_id = OBJECT_ID('absence_types'))
BEGIN
    CREATE INDEX IX_absence_types_is_active ON absence_types (is_active);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'absence_requests')
BEGIN
    CREATE TABLE absence_requests (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_absence_requests PRIMARY KEY DEFAULT NEWID(),
        employee_id UNIQUEIDENTIFIER NOT NULL,
        absence_type_id UNIQUEIDENTIFIER NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        start_period NVARCHAR(20) NOT NULL CONSTRAINT DF_absence_requests_start_period DEFAULT 'FULL_DAY',
        end_period NVARCHAR(20) NOT NULL CONSTRAINT DF_absence_requests_end_period DEFAULT 'FULL_DAY',
        total_days DECIMAL(5, 1) NOT NULL,
        reason NVARCHAR(1000) NOT NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_absence_requests_status DEFAULT 'PENDING',
        requested_via NVARCHAR(30) NOT NULL,
        source_message_sid NVARCHAR(100) NULL,
        reviewed_by_user_id UNIQUEIDENTIFIER NULL,
        reviewed_at DATETIME2 NULL,
        review_comment NVARCHAR(1000) NULL,
        cancelled_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_absence_requests_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_absence_requests_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_absence_requests_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
        CONSTRAINT FK_absence_requests_absence_type FOREIGN KEY (absence_type_id) REFERENCES absence_types (id),
        CONSTRAINT FK_absence_requests_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id),
        CONSTRAINT CK_absence_requests_status CHECK (
            status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'NEEDS_INFO')
        ),
        CONSTRAINT CK_absence_requests_requested_via CHECK (
            requested_via IN ('WHATSAPP', 'ADMIN')
        ),
        CONSTRAINT CK_absence_requests_start_period CHECK (
            start_period IN ('FULL_DAY', 'AM', 'PM')
        ),
        CONSTRAINT CK_absence_requests_end_period CHECK (
            end_period IN ('FULL_DAY', 'AM', 'PM')
        ),
        CONSTRAINT CK_absence_requests_dates CHECK (start_date <= end_date),
        CONSTRAINT CK_absence_requests_total_days CHECK (total_days > 0)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_absence_requests_source_message_sid'
      AND object_id = OBJECT_ID('absence_requests')
)
BEGIN
    CREATE UNIQUE INDEX UQ_absence_requests_source_message_sid
        ON absence_requests (source_message_sid)
        WHERE source_message_sid IS NOT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_absence_requests_employee_id' AND object_id = OBJECT_ID('absence_requests'))
BEGIN
    CREATE INDEX IX_absence_requests_employee_id ON absence_requests (employee_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_absence_requests_status' AND object_id = OBJECT_ID('absence_requests'))
BEGIN
    CREATE INDEX IX_absence_requests_status ON absence_requests (status);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_absence_requests_dates' AND object_id = OBJECT_ID('absence_requests'))
BEGIN
    CREATE INDEX IX_absence_requests_dates ON absence_requests (start_date, end_date);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_absence_requests_created_at' AND object_id = OBJECT_ID('absence_requests'))
BEGIN
    CREATE INDEX IX_absence_requests_created_at ON absence_requests (created_at DESC);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'absence_request_events')
BEGIN
    CREATE TABLE absence_request_events (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_absence_request_events PRIMARY KEY DEFAULT NEWID(),
        absence_request_id UNIQUEIDENTIFIER NOT NULL,
        event_type NVARCHAR(40) NOT NULL,
        old_status NVARCHAR(30) NULL,
        new_status NVARCHAR(30) NULL,
        performed_by_user_id UNIQUEIDENTIFIER NULL,
        performed_by_employee_id UNIQUEIDENTIFIER NULL,
        comment NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_absence_request_events_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_absence_request_events_request FOREIGN KEY (absence_request_id) REFERENCES absence_requests (id),
        CONSTRAINT FK_absence_request_events_user FOREIGN KEY (performed_by_user_id) REFERENCES users (id),
        CONSTRAINT FK_absence_request_events_employee FOREIGN KEY (performed_by_employee_id) REFERENCES employees (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_absence_request_events_request_id'
      AND object_id = OBJECT_ID('absence_request_events')
)
BEGIN
    CREATE INDEX IX_absence_request_events_request_id ON absence_request_events (absence_request_id, created_at);
END;
GO

-- Seed absence types
IF NOT EXISTS (SELECT 1 FROM absence_types WHERE code = N'VACATION')
BEGIN
    INSERT INTO absence_types (code, name, description, requires_approval, requires_attachment, deducts_balance, allows_half_day)
    VALUES
        (N'VACATION', N'Vacaciones', N'Licencia por vacaciones', 1, 0, 1, 0),
        (N'STUDY_DAY', N'Día de estudio', N'Ausencia por día de estudio', 1, 0, 1, 1),
        (N'SICK_LEAVE', N'Salud', N'Ausencia por motivos de salud', 1, 0, 0, 1),
        (N'PERSONAL_PROCEDURE', N'Trámite personal', N'Ausencia por trámite personal', 1, 0, 0, 0),
        (N'JUSTIFIED_ABSENCE', N'Ausencia justificada', N'Ausencia justificada', 1, 0, 0, 0),
        (N'UNJUSTIFIED_ABSENCE', N'Ausencia injustificada', N'Ausencia injustificada', 1, 0, 0, 0),
        (N'SPECIAL_LEAVE', N'Licencia especial', N'Licencia especial', 1, 0, 0, 0),
        (N'OTHER', N'Otro', N'Otro tipo de ausencia', 1, 0, 0, 0);
END;
GO

-- Extend bot session states for absence request flow
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_bot_sessions_state'
      AND parent_object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    ALTER TABLE bot_sessions DROP CONSTRAINT CK_bot_sessions_state;
END;
GO

ALTER TABLE bot_sessions
    ADD CONSTRAINT CK_bot_sessions_state
    CHECK (state IN (
        'WAITING_LOCATION',
        'WAITING_INVENTORY_SELECTION',
        'WAITING_CHECKOUT_LOCATION',
        'WAITING_CHECKOUT_INVENTORY_SELECTION',
        'WAITING_ABSENCE_TYPE',
        'WAITING_ABSENCE_START_DATE',
        'WAITING_ABSENCE_END_DATE',
        'WAITING_ABSENCE_REASON',
        'WAITING_ABSENCE_CONFIRMATION',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED'
    ));
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_bot_sessions_active_employee'
      AND object_id = OBJECT_ID('bot_sessions')
)
BEGIN
    DROP INDEX UX_bot_sessions_active_employee ON bot_sessions;
END;
GO

CREATE UNIQUE INDEX UX_bot_sessions_active_employee
    ON bot_sessions (employee_id)
    WHERE state IN (
        'WAITING_LOCATION',
        'WAITING_INVENTORY_SELECTION',
        'WAITING_CHECKOUT_LOCATION',
        'WAITING_CHECKOUT_INVENTORY_SELECTION',
        'WAITING_ABSENCE_TYPE',
        'WAITING_ABSENCE_START_DATE',
        'WAITING_ABSENCE_END_DATE',
        'WAITING_ABSENCE_REASON',
        'WAITING_ABSENCE_CONFIRMATION'
    );
GO
