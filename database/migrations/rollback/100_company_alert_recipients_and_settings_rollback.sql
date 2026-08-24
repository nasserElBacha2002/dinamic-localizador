USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_alert_recipients', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.company_alert_recipients;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_settings')
      AND name = N'admin_alerts_enabled'
)
BEGIN
    ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_company_settings_admin_alerts_enabled;
    ALTER TABLE dbo.company_settings DROP COLUMN admin_alerts_enabled;
END;
GO
