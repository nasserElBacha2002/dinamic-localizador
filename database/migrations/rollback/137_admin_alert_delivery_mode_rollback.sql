/*
  Rollback: 137_admin_alert_delivery_mode_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_waan_company_status_type'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    DROP INDEX IX_waan_company_status_type ON dbo.whatsapp_admin_alert_notifications;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'suppressed_at') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN suppressed_at;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'suppressed_reason') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN suppressed_reason;
END;
GO

IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'suppressed_config_version') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP COLUMN suppressed_config_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cs_admin_alert_delivery_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_admin_alert_delivery_mode;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = N'DF_cs_admin_alert_delivery_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_admin_alert_delivery_mode;
END;
GO

IF COL_LENGTH(N'dbo.company_settings', N'admin_alert_delivery_mode') IS NOT NULL
BEGIN
    ALTER TABLE dbo.company_settings DROP COLUMN admin_alert_delivery_mode;
END;
GO
