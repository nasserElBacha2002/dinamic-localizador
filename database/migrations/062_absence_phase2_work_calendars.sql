/*
  Migration: 062_absence_phase2_work_calendars.sql
  Purpose:
    - Absence work calendars (weekdays + holiday/override dates)
    - day_counting_mode on absence_types (default CALENDAR_DAYS = legacy)
    - calculation snapshot columns on absence_requests
    - company_settings.absence_advanced_calendar_enabled feature flag
  Rollback:
    ALTER TABLE company_settings DROP COLUMN absence_advanced_calendar_enabled;
    ALTER TABLE absence_requests DROP COLUMN calculation_mode, calendar_id, calendar_timezone, calculation_version;
    ALTER TABLE absence_types DROP COLUMN day_counting_mode, calendar_id;
    DROP TABLE company_calendar_dates, company_work_calendar_weekdays, company_work_calendars;
*/

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- company_work_calendars
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_work_calendars')
BEGIN
    CREATE TABLE dbo.company_work_calendars (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_work_calendars PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(120) NOT NULL,
        is_default BIT NOT NULL CONSTRAINT DF_company_work_calendars_is_default DEFAULT 0,
        timezone NVARCHAR(80) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_company_work_calendars_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_calendars_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_calendars_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_work_calendars_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_company_work_calendars_default'
      AND object_id = OBJECT_ID('dbo.company_work_calendars')
)
BEGIN
    CREATE UNIQUE INDEX UQ_company_work_calendars_default
        ON dbo.company_work_calendars (company_id)
        WHERE is_default = 1 AND is_active = 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_work_calendars_company'
      AND object_id = OBJECT_ID('dbo.company_work_calendars')
)
BEGIN
    CREATE INDEX IX_company_work_calendars_company
        ON dbo.company_work_calendars (company_id, is_active);
END;
GO

-- ---------------------------------------------------------------------------
-- company_work_calendar_weekdays
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_work_calendar_weekdays')
BEGIN
    CREATE TABLE dbo.company_work_calendar_weekdays (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_work_calendar_weekdays PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        calendar_id UNIQUEIDENTIFIER NOT NULL,
        day_of_week INT NOT NULL,
        is_working_day BIT NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_calendar_weekdays_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_work_calendar_weekdays_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_work_calendar_weekdays_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_company_work_calendar_weekdays_calendar FOREIGN KEY (calendar_id) REFERENCES dbo.company_work_calendars (id),
        CONSTRAINT CK_company_work_calendar_weekdays_dow CHECK (day_of_week BETWEEN 1 AND 7),
        CONSTRAINT UQ_company_work_calendar_weekdays UNIQUE (calendar_id, day_of_week)
    );
END;
GO

-- ---------------------------------------------------------------------------
-- company_calendar_dates (holidays / overrides)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'company_calendar_dates')
BEGIN
    CREATE TABLE dbo.company_calendar_dates (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_calendar_dates PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        calendar_id UNIQUEIDENTIFIER NOT NULL,
        [date] DATE NOT NULL,
        name NVARCHAR(200) NOT NULL,
        date_type NVARCHAR(40) NOT NULL,
        is_working_day BIT NOT NULL,
        notes NVARCHAR(500) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_company_calendar_dates_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_company_calendar_dates_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_calendar_dates_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_calendar_dates_company FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_company_calendar_dates_calendar FOREIGN KEY (calendar_id) REFERENCES dbo.company_work_calendars (id),
        CONSTRAINT CK_company_calendar_dates_type CHECK (
            date_type IN (N'HOLIDAY', N'NON_WORKING_DAY', N'WORKING_DAY_OVERRIDE', N'COMPANY_EVENT')
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_company_calendar_dates_active'
      AND object_id = OBJECT_ID('dbo.company_calendar_dates')
)
BEGIN
    CREATE UNIQUE INDEX UQ_company_calendar_dates_active
        ON dbo.company_calendar_dates (company_id, calendar_id, [date])
        WHERE is_active = 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_calendar_dates_range'
      AND object_id = OBJECT_ID('dbo.company_calendar_dates')
)
BEGIN
    CREATE INDEX IX_company_calendar_dates_range
        ON dbo.company_calendar_dates (company_id, calendar_id, [date])
        INCLUDE (date_type, is_working_day, is_active, name);
END;
GO

-- ---------------------------------------------------------------------------
-- absence_types.day_counting_mode + optional calendar_id
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_types') AND name = 'day_counting_mode'
)
BEGIN
    ALTER TABLE dbo.absence_types
        ADD day_counting_mode NVARCHAR(30) NOT NULL
            CONSTRAINT DF_absence_types_day_counting_mode DEFAULT N'CALENDAR_DAYS';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_types_day_counting_mode'
      AND parent_object_id = OBJECT_ID('dbo.absence_types')
)
BEGIN
    ALTER TABLE dbo.absence_types
        ADD CONSTRAINT CK_absence_types_day_counting_mode
        CHECK (day_counting_mode IN (N'CALENDAR_DAYS', N'BUSINESS_DAYS'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_types') AND name = 'calendar_id'
)
BEGIN
    ALTER TABLE dbo.absence_types ADD calendar_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_absence_types_calendar'
)
BEGIN
    ALTER TABLE dbo.absence_types
        ADD CONSTRAINT FK_absence_types_calendar
        FOREIGN KEY (calendar_id) REFERENCES dbo.company_work_calendars (id);
END;
GO

-- ---------------------------------------------------------------------------
-- absence_requests calculation snapshot
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calculation_mode'
)
BEGIN
    ALTER TABLE dbo.absence_requests ADD calculation_mode NVARCHAR(30) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calendar_id'
)
BEGIN
    ALTER TABLE dbo.absence_requests ADD calendar_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calendar_timezone'
)
BEGIN
    ALTER TABLE dbo.absence_requests ADD calendar_timezone NVARCHAR(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calculation_version'
)
BEGIN
    ALTER TABLE dbo.absence_requests ADD calculation_version INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_absence_requests_calendar'
)
BEGIN
    ALTER TABLE dbo.absence_requests
        ADD CONSTRAINT FK_absence_requests_calendar
        FOREIGN KEY (calendar_id) REFERENCES dbo.company_work_calendars (id);
END;
GO

-- ---------------------------------------------------------------------------
-- Feature flag on company_settings
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings') AND name = 'absence_advanced_calendar_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD absence_advanced_calendar_enabled BIT NOT NULL
            CONSTRAINT DF_company_settings_absence_advanced_calendar_enabled DEFAULT 1;
END;
GO

-- ---------------------------------------------------------------------------
-- Backfill: default calendar per company from work schedule weekdays (Mon–Fri)
-- ---------------------------------------------------------------------------
;WITH companies_missing AS (
    SELECT c.id AS company_id,
           COALESCE(NULLIF(cs.operation_timezone, N''), NULLIF(c.default_timezone, N''), N'America/Argentina/Buenos_Aires') AS timezone
    FROM dbo.companies c
    LEFT JOIN dbo.company_settings cs ON cs.company_id = c.id
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.company_work_calendars cal
        WHERE cal.company_id = c.id AND cal.is_default = 1 AND cal.is_active = 1
    )
)
INSERT INTO dbo.company_work_calendars (company_id, name, is_default, timezone, is_active)
SELECT company_id, N'Calendario laboral', 1, timezone, 1
FROM companies_missing;
GO

-- Weekdays: prefer work schedule is_enabled; otherwise Mon–Fri working
INSERT INTO dbo.company_work_calendar_weekdays (company_id, calendar_id, day_of_week, is_working_day)
SELECT cal.company_id, cal.id, dow.day_of_week,
       COALESCE(wsd.is_enabled, CASE WHEN dow.day_of_week BETWEEN 1 AND 5 THEN 1 ELSE 0 END)
FROM dbo.company_work_calendars cal
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7)) AS dow(day_of_week)
LEFT JOIN dbo.company_work_schedules cws ON cws.company_id = cal.company_id
LEFT JOIN dbo.company_work_schedule_days wsd
    ON wsd.company_work_schedule_id = cws.id AND wsd.day_of_week = dow.day_of_week
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.company_work_calendar_weekdays w
    WHERE w.calendar_id = cal.id AND w.day_of_week = dow.day_of_week
);
GO

UPDATE dbo.absence_types
SET day_counting_mode = N'CALENDAR_DAYS'
WHERE day_counting_mode IS NULL OR LTRIM(RTRIM(day_counting_mode)) = N'';
GO
