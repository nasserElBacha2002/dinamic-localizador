/*
  Migration: 137_admin_alert_delivery_mode.sql

  Phase 2 cutover: per-company admin alert delivery mode.
  Default WHATSAPP_LEGACY — does NOT activate DAILY_EMAIL for any company.

  Rollback: rollback/137_admin_alert_delivery_mode_rollback.sql
*/

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.company_settings', N'admin_alert_delivery_mode') IS NULL
BEGIN
    ALTER TABLE dbo.company_settings
        ADD admin_alert_delivery_mode NVARCHAR(32) NOT NULL
            CONSTRAINT DF_cs_admin_alert_delivery_mode DEFAULT N'WHATSAPP_LEGACY';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cs_admin_alert_delivery_mode'
      AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
)
BEGIN
    ALTER TABLE dbo.company_settings
        ADD CONSTRAINT CK_cs_admin_alert_delivery_mode CHECK (
            admin_alert_delivery_mode IN (N'WHATSAPP_LEGACY', N'DAILY_EMAIL')
        );
END;
GO

/* Ensure every row is legacy (defensive if column added without default somehow) */
UPDATE dbo.company_settings
SET admin_alert_delivery_mode = N'WHATSAPP_LEGACY'
WHERE admin_alert_delivery_mode IS NULL
   OR admin_alert_delivery_mode NOT IN (N'WHATSAPP_LEGACY', N'DAILY_EMAIL');
GO

IF COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'suppressed_at') IS NULL
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        ADD suppressed_at DATETIME2 NULL,
            suppressed_reason NVARCHAR(80) NULL,
            suppressed_config_version NVARCHAR(64) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_waan_company_status_type'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
)
BEGIN
    CREATE INDEX IX_waan_company_status_type
        ON dbo.whatsapp_admin_alert_notifications (company_id, status, alert_type)
        INCLUDE (suppressed_at, suppressed_reason);
END;
GO
