/*
  Rollback: 069_absence_phase5_operational_integration_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID('dbo.absence_operational_conflicts', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.absence_operational_conflicts;
END;
GO

IF OBJECT_ID('dbo.absence_operational_effects', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.absence_operational_effects;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.absence_requests')
      AND name = 'operational_impact_version'
)
BEGIN
    ALTER TABLE dbo.absence_requests DROP CONSTRAINT DF_ar_operational_impact_version;
    ALTER TABLE dbo.absence_requests DROP COLUMN operational_impact_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.company_settings')
      AND name = 'absence_operational_integration_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_absence_operational_integration;
    ALTER TABLE dbo.company_settings DROP COLUMN absence_operational_integration_enabled;
END;
GO
