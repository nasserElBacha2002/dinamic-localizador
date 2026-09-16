/*
  Rollback: 125_whatsapp_usage_quotas_rollback.sql

  DESTRUCTIVE: drops quota tables and company_settings quota columns.
  Prefer operational OFF (whatsapp_quota_mode / WHATSAPP_QUOTA_GLOBAL_MODE)
  to preserve history.

  Prerequisites before DROP:
  - Stop all quota consumers (set modes OFF, redeploy if needed).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_limit_notices', N'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_quota_limit_notices;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_outbound_reservations', N'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_quota_outbound_reservations;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_turn_admissions', N'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_quota_turn_admissions;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_company_periods', N'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_quota_company_periods;
GO

IF OBJECT_ID(N'dbo.whatsapp_quota_employee_periods', N'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_quota_employee_periods;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_company_settings_whatsapp_quota_mode'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_company_settings_whatsapp_quota_mode;

    IF COL_LENGTH(N'dbo.company_settings', N'whatsapp_quota_mode') IS NOT NULL
    BEGIN
        DECLARE @df SYSNAME;
        SELECT @df = dc.name
        FROM sys.default_constraints dc
        JOIN sys.columns c ON c.default_object_id = dc.object_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.company_settings')
          AND c.name = N'whatsapp_quota_mode';
        IF @df IS NOT NULL EXEC(N'ALTER TABLE dbo.company_settings DROP CONSTRAINT [' + @df + N']');
        ALTER TABLE dbo.company_settings DROP COLUMN whatsapp_quota_mode;
    END;

    -- Drop remaining quota columns if present (best-effort; defaults named DF_cs_wa_*).
    IF COL_LENGTH(N'dbo.company_settings', N'whatsapp_quota_daily_turns') IS NOT NULL
    BEGIN
        DECLARE @sql NVARCHAR(MAX) = N'';
        SELECT @sql = @sql + N'ALTER TABLE dbo.company_settings DROP CONSTRAINT [' + dc.name + N'];'
        FROM sys.default_constraints dc
        JOIN sys.columns c ON c.default_object_id = dc.object_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.company_settings')
          AND c.name LIKE N'whatsapp_quota_%';
        IF LEN(@sql) > 0 EXEC sp_executesql @sql;

        ALTER TABLE dbo.company_settings DROP COLUMN
            whatsapp_quota_daily_turns,
            whatsapp_quota_weekly_turns,
            whatsapp_quota_burst_turns,
            whatsapp_quota_burst_window_seconds,
            whatsapp_quota_daily_outbounds,
            whatsapp_quota_weekly_outbounds,
            whatsapp_quota_company_daily_outbounds,
            whatsapp_quota_limit_notice_enabled;
    END;
END;
GO
