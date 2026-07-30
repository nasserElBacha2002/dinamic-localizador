/*
  Full rollback for Phase 2 calendars (062 + 063 corrections).
  Execute AFTER 063 rollback (or includes overlapping drops safely).

  Order: FKs → indexes → checks → defaults → columns → child tables → parent.
*/

USE dinamic_attendance;
GO

-- Run 063 column rollback first if still present
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calculation_input_hash'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP COLUMN calculation_input_hash;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calendar_version'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP COLUMN calendar_version;
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_absence_requests_calendar')
BEGIN
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT FK_absence_requests_calendar;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calculation_version'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP COLUMN calculation_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calendar_timezone'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP COLUMN calendar_timezone;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calendar_id'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP COLUMN calendar_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calculation_mode'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP COLUMN calculation_mode;
END;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_absence_types_calendar')
BEGIN
    ALTER TABLE dbo.absence_types DROP CONSTRAINT FK_absence_types_calendar;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_types') AND name = 'calendar_id'
)
BEGIN
    ALTER TABLE dbo.absence_types DROP COLUMN calendar_id;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_absence_types_day_counting_mode'
)
BEGIN
    ALTER TABLE dbo.absence_types DROP CONSTRAINT CK_absence_types_day_counting_mode;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_absence_types_day_counting_mode'
)
BEGIN
    ALTER TABLE dbo.absence_types DROP CONSTRAINT DF_absence_types_day_counting_mode;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_types') AND name = 'day_counting_mode'
)
BEGIN
    ALTER TABLE dbo.absence_types DROP COLUMN day_counting_mode;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_company_settings_absence_advanced_calendar_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings
        DROP CONSTRAINT DF_company_settings_absence_advanced_calendar_enabled;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings')
      AND name = 'absence_advanced_calendar_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings DROP COLUMN absence_advanced_calendar_enabled;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_calendar_dates_range'
      AND object_id = OBJECT_ID('dbo.company_calendar_dates')
)
BEGIN
    DROP INDEX IX_company_calendar_dates_range ON dbo.company_calendar_dates;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_company_calendar_dates_active'
      AND object_id = OBJECT_ID('dbo.company_calendar_dates')
)
BEGIN
    DROP INDEX UQ_company_calendar_dates_active ON dbo.company_calendar_dates;
END;
GO

IF OBJECT_ID('dbo.company_calendar_dates', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_calendar_dates;
END;
GO

IF OBJECT_ID('dbo.company_work_calendar_weekdays', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_work_calendar_weekdays;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_company_work_calendars_default'
      AND object_id = OBJECT_ID('dbo.company_work_calendars')
)
BEGIN
    DROP INDEX UQ_company_work_calendars_default ON dbo.company_work_calendars;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_company_work_calendars_company'
      AND object_id = OBJECT_ID('dbo.company_work_calendars')
)
BEGIN
    DROP INDEX IX_company_work_calendars_company ON dbo.company_work_calendars;
END;
GO

IF OBJECT_ID('dbo.company_work_calendars', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_work_calendars;
END;
GO
