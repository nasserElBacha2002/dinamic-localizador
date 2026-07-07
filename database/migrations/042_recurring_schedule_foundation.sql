-- Phase 3: Company weekly work schedule + recurring operation schedule foundation.
-- Weekday convention: day_of_week INT 1=Monday .. 7=Sunday (ISO 8601).
-- Does NOT materialize recurring operation_workdays.

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- scheduled_operations: nullable timestamps for RECURRING
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.scheduled_operations') AND name = 'scheduled_start' AND is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.scheduled_operations ALTER COLUMN scheduled_start DATETIME2 NULL;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_scheduled_operations_kind_schedule'
      AND parent_object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations DROP CONSTRAINT CK_scheduled_operations_kind_schedule;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_scheduled_operations_kind_schedule'
      AND parent_object_id = OBJECT_ID('dbo.scheduled_operations')
)
BEGIN
    ALTER TABLE dbo.scheduled_operations
        ADD CONSTRAINT CK_scheduled_operations_kind_schedule
        CHECK (
            (operation_kind = N'ONE_TIME' AND scheduled_start IS NOT NULL)
            OR (operation_kind = N'RECURRING' AND scheduled_start IS NULL AND scheduled_end IS NULL)
        );
END;
GO

-- ---------------------------------------------------------------------------
-- company_work_schedules
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_work_schedules')
BEGIN
    CREATE TABLE dbo.company_work_schedules (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_work_schedules PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        timezone NVARCHAR(80) NOT NULL,
        version INT NOT NULL CONSTRAINT DF_company_work_schedules_version DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_schedules_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_schedules_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_work_schedules_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT UQ_company_work_schedules_company UNIQUE (company_id),
        CONSTRAINT CK_company_work_schedules_version CHECK (version >= 1)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_work_schedules_company_id'
      AND object_id = OBJECT_ID('dbo.company_work_schedules')
)
BEGIN
    CREATE INDEX IX_company_work_schedules_company_id
        ON dbo.company_work_schedules (company_id);
END;
GO

-- ---------------------------------------------------------------------------
-- company_work_schedule_days
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_work_schedule_days')
BEGIN
    CREATE TABLE dbo.company_work_schedule_days (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_work_schedule_days PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        company_work_schedule_id UNIQUEIDENTIFIER NOT NULL,
        day_of_week TINYINT NOT NULL,
        is_enabled BIT NOT NULL CONSTRAINT DF_company_work_schedule_days_is_enabled DEFAULT 0,
        start_time TIME NULL,
        end_time TIME NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_schedule_days_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_schedule_days_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_work_schedule_days_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_company_work_schedule_days_schedule
            FOREIGN KEY (company_work_schedule_id) REFERENCES dbo.company_work_schedules (id),
        CONSTRAINT UQ_company_work_schedule_days_schedule_day
            UNIQUE (company_work_schedule_id, day_of_week),
        CONSTRAINT CK_company_work_schedule_days_day_of_week
            CHECK (day_of_week BETWEEN 1 AND 7),
        CONSTRAINT CK_company_work_schedule_days_enabled_times
            CHECK (
                (is_enabled = 0 AND start_time IS NULL AND end_time IS NULL)
                OR (
                    is_enabled = 1
                    AND start_time IS NOT NULL
                    AND end_time IS NOT NULL
                    AND start_time <> end_time
                )
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_work_schedule_days_schedule_day'
      AND object_id = OBJECT_ID('dbo.company_work_schedule_days')
)
BEGIN
    CREATE INDEX IX_company_work_schedule_days_schedule_day
        ON dbo.company_work_schedule_days (company_work_schedule_id, day_of_week)
        INCLUDE (is_enabled, start_time, end_time);
END;
GO

-- ---------------------------------------------------------------------------
-- operation_schedules
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'operation_schedules')
BEGIN
    CREATE TABLE dbo.operation_schedules (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_schedules PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_id UNIQUEIDENTIFIER NOT NULL,
        schedule_source NVARCHAR(20) NOT NULL,
        timezone NVARCHAR(80) NOT NULL,
        valid_from DATE NOT NULL,
        valid_until DATE NULL,
        version INT NOT NULL CONSTRAINT DF_operation_schedules_version DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_operation_schedules_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_operation_schedules_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_operation_schedules_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_operation_schedules_operation
            FOREIGN KEY (operation_id) REFERENCES dbo.scheduled_operations (id),
        CONSTRAINT UQ_operation_schedules_operation UNIQUE (operation_id),
        CONSTRAINT CK_operation_schedules_source
            CHECK (schedule_source IN (N'COMPANY', N'CUSTOM')),
        CONSTRAINT CK_operation_schedules_valid_range
            CHECK (valid_until IS NULL OR valid_until >= valid_from),
        CONSTRAINT CK_operation_schedules_version CHECK (version >= 1)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_schedules_company_operation'
      AND object_id = OBJECT_ID('dbo.operation_schedules')
)
BEGIN
    CREATE INDEX IX_operation_schedules_company_operation
        ON dbo.operation_schedules (company_id, operation_id)
        INCLUDE (schedule_source, valid_from, valid_until, version);
END;
GO

-- ---------------------------------------------------------------------------
-- operation_schedule_days (CUSTOM source only)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'operation_schedule_days')
BEGIN
    CREATE TABLE dbo.operation_schedule_days (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_operation_schedule_days PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        operation_schedule_id UNIQUEIDENTIFIER NOT NULL,
        day_of_week TINYINT NOT NULL,
        is_enabled BIT NOT NULL CONSTRAINT DF_operation_schedule_days_is_enabled DEFAULT 0,
        start_time TIME NULL,
        end_time TIME NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_operation_schedule_days_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_operation_schedule_days_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_operation_schedule_days_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_operation_schedule_days_schedule
            FOREIGN KEY (operation_schedule_id) REFERENCES dbo.operation_schedules (id),
        CONSTRAINT UQ_operation_schedule_days_schedule_day
            UNIQUE (operation_schedule_id, day_of_week),
        CONSTRAINT CK_operation_schedule_days_day_of_week
            CHECK (day_of_week BETWEEN 1 AND 7),
        CONSTRAINT CK_operation_schedule_days_enabled_times
            CHECK (
                (is_enabled = 0 AND start_time IS NULL AND end_time IS NULL)
                OR (
                    is_enabled = 1
                    AND start_time IS NOT NULL
                    AND end_time IS NOT NULL
                    AND start_time <> end_time
                )
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_schedule_days_schedule_day'
      AND object_id = OBJECT_ID('dbo.operation_schedule_days')
)
BEGIN
    CREATE INDEX IX_operation_schedule_days_schedule_day
        ON dbo.operation_schedule_days (operation_schedule_id, day_of_week)
        INCLUDE (is_enabled, start_time, end_time);
END;
GO

-- ---------------------------------------------------------------------------
-- Backfill company weekly schedules from company_settings defaults (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO dbo.company_work_schedules (company_id, timezone, version)
SELECT cs.company_id, cs.operation_timezone, 1
FROM dbo.company_settings cs
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.company_work_schedules cws WHERE cws.company_id = cs.company_id
);
GO

;WITH weekday_seed AS (
    SELECT v.day_of_week
    FROM (VALUES (1), (2), (3), (4), (5), (6), (7)) AS v(day_of_week)
)
INSERT INTO dbo.company_work_schedule_days (
    company_id,
    company_work_schedule_id,
    day_of_week,
    is_enabled,
    start_time,
    end_time
)
SELECT
    cws.company_id,
    cws.id,
    ws.day_of_week,
    CASE WHEN ws.day_of_week BETWEEN 1 AND 5 THEN 1 ELSE 0 END,
    CASE WHEN ws.day_of_week BETWEEN 1 AND 5 THEN COALESCE(cs.default_operation_start_time, CAST(N'20:30:00' AS TIME)) ELSE NULL END,
    CASE WHEN ws.day_of_week BETWEEN 1 AND 5 THEN COALESCE(cs.default_operation_end_time, CAST(N'03:00:00' AS TIME)) ELSE NULL END
FROM dbo.company_work_schedules cws
INNER JOIN dbo.company_settings cs ON cs.company_id = cws.company_id
CROSS JOIN weekday_seed ws
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.company_work_schedule_days cwd
    WHERE cwd.company_work_schedule_id = cws.id
      AND cwd.day_of_week = ws.day_of_week
);
GO
