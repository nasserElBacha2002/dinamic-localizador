/*
  Rollback: 134_daily_attendance_report_rollback.sql
  Drops Phase 1 daily attendance report objects. Does not touch WhatsApp alert settings.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_daily_attendance_report_deliveries;
END;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_runs', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_daily_attendance_report_runs;
END;
GO

IF OBJECT_ID(N'dbo.company_report_email_recipients', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_report_email_recipients;
END;
GO

IF COL_LENGTH(N'dbo.company_settings', N'daily_attendance_report_time') IS NOT NULL
BEGIN
    DECLARE @dfTime SYSNAME;
    SELECT @dfTime = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
      ON c.default_object_id = dc.object_id
     AND c.object_id = dc.parent_object_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.company_settings')
      AND c.name = N'daily_attendance_report_time';
    IF @dfTime IS NOT NULL
        EXEC(N'ALTER TABLE dbo.company_settings DROP CONSTRAINT [' + @dfTime + N']');
    ALTER TABLE dbo.company_settings DROP COLUMN daily_attendance_report_time;
END;
GO

IF COL_LENGTH(N'dbo.company_settings', N'daily_attendance_report_enabled') IS NOT NULL
BEGIN
    DECLARE @dfEnabled SYSNAME;
    SELECT @dfEnabled = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
      ON c.default_object_id = dc.object_id
     AND c.object_id = dc.parent_object_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.company_settings')
      AND c.name = N'daily_attendance_report_enabled';
    IF @dfEnabled IS NOT NULL
        EXEC(N'ALTER TABLE dbo.company_settings DROP CONSTRAINT [' + @dfEnabled + N']');
    ALTER TABLE dbo.company_settings DROP COLUMN daily_attendance_report_enabled;
END;
GO
