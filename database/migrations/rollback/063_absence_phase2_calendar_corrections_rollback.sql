/*
  Rollback for 063_absence_phase2_calendar_corrections.sql
  Order: FKs (none new) → check/default constraints → columns

  Full Phase 2 teardown (062+063) is in:
    rollback/062_absence_phase2_work_calendars_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_work_calendars_version'
      AND parent_object_id = OBJECT_ID('dbo.company_work_calendars')
)
BEGIN
    ALTER TABLE dbo.company_work_calendars DROP CONSTRAINT CK_company_work_calendars_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_company_work_calendars_version'
      AND parent_object_id = OBJECT_ID('dbo.company_work_calendars')
)
BEGIN
    ALTER TABLE dbo.company_work_calendars DROP CONSTRAINT DF_company_work_calendars_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_work_calendars') AND name = 'version'
)
BEGIN
    ALTER TABLE dbo.company_work_calendars DROP COLUMN version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_calendar_dates_version'
      AND parent_object_id = OBJECT_ID('dbo.company_calendar_dates')
)
BEGIN
    ALTER TABLE dbo.company_calendar_dates DROP CONSTRAINT CK_company_calendar_dates_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_company_calendar_dates_version'
      AND parent_object_id = OBJECT_ID('dbo.company_calendar_dates')
)
BEGIN
    ALTER TABLE dbo.company_calendar_dates DROP CONSTRAINT DF_company_calendar_dates_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_calendar_dates') AND name = 'version'
)
BEGIN
    ALTER TABLE dbo.company_calendar_dates DROP COLUMN version;
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

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calculation_input_hash'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP COLUMN calculation_input_hash;
END;
GO

-- Restore flag default to 1 (062 original); do not force existing rows back to 1
IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_company_settings_absence_advanced_calendar_enabled'
      AND parent_object_id = OBJECT_ID('dbo.company_settings')
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
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT DF_company_settings_absence_advanced_calendar_enabled
        DEFAULT 1 FOR absence_advanced_calendar_enabled;
END;
GO
