/*
  Migration: 063_absence_phase2_calendar_corrections.sql
  Purpose:
    - Optimistic concurrency version on calendars and calendar dates
    - Snapshot reproducibility: calendar_version, calculation_input_hash
    - Feature flag rollout: default OFF; set existing companies to 0
  Rollback: see database/migrations/rollback/063_absence_phase2_calendar_corrections_rollback.sql
*/

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- Version columns for optimistic concurrency
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_work_calendars') AND name = 'version'
)
BEGIN
    ALTER TABLE dbo.company_work_calendars
        ADD version INT NOT NULL
            CONSTRAINT DF_company_work_calendars_version DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_work_calendars_version'
      AND parent_object_id = OBJECT_ID('dbo.company_work_calendars')
)
BEGIN
    ALTER TABLE dbo.company_work_calendars
        ADD CONSTRAINT CK_company_work_calendars_version CHECK (version >= 1);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_calendar_dates') AND name = 'version'
)
BEGIN
    ALTER TABLE dbo.company_calendar_dates
        ADD version INT NOT NULL
            CONSTRAINT DF_company_calendar_dates_version DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_company_calendar_dates_version'
      AND parent_object_id = OBJECT_ID('dbo.company_calendar_dates')
)
BEGIN
    ALTER TABLE dbo.company_calendar_dates
        ADD CONSTRAINT CK_company_calendar_dates_version CHECK (version >= 1);
END;
GO

-- ---------------------------------------------------------------------------
-- Request snapshot reproducibility
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calendar_version'
)
BEGIN
    ALTER TABLE dbo.absence_requests ADD calendar_version INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests') AND name = 'calculation_input_hash'
)
BEGIN
    ALTER TABLE dbo.absence_requests ADD calculation_input_hash NVARCHAR(64) NULL;
END;
GO

-- ---------------------------------------------------------------------------
-- Feature flag: safe rollout (OFF until admin activates)
-- ---------------------------------------------------------------------------
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
        DEFAULT 0 FOR absence_advanced_calendar_enabled;

    UPDATE dbo.company_settings
    SET absence_advanced_calendar_enabled = 0
    WHERE absence_advanced_calendar_enabled = 1;
END;
GO
