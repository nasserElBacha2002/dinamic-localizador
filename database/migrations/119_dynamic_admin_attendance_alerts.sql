/*
  Migration: 119_dynamic_admin_attendance_alerts.sql

  Adds dynamic admin attendance alert types and company settings:
    - ATTENDANCE_CONFIRMATION_MISSING
    - MISSING_CHECKIN_AFTER_START
    - MISSING_CHECKOUT_AFTER_END

  Safe / idempotent: IF NOT EXISTS columns, drop+readd CHECK when needed.
  Does not backfill historical WhatsApp obligations.
*/

USE dinamic_attendance;
GO

/* ---- company_settings: dynamic attendance admin alerts ---- */
IF OBJECT_ID(N'dbo.company_settings', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.company_settings', N'admin_attendance_confirmation_missing_enabled') IS NULL
        ALTER TABLE dbo.company_settings
            ADD admin_attendance_confirmation_missing_enabled BIT NOT NULL
                CONSTRAINT DF_cs_admin_att_conf_missing_enabled DEFAULT (1);

    IF COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkin_enabled') IS NULL
        ALTER TABLE dbo.company_settings
            ADD admin_missing_checkin_enabled BIT NOT NULL
                CONSTRAINT DF_cs_admin_missing_checkin_enabled DEFAULT (1);

    IF COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkout_enabled') IS NULL
        ALTER TABLE dbo.company_settings
            ADD admin_missing_checkout_enabled BIT NOT NULL
                CONSTRAINT DF_cs_admin_missing_checkout_enabled DEFAULT (1);

    IF COL_LENGTH(N'dbo.company_settings', N'admin_confirmation_escalation_minutes') IS NULL
        ALTER TABLE dbo.company_settings
            ADD admin_confirmation_escalation_minutes INT NOT NULL
                CONSTRAINT DF_cs_admin_conf_escalation_minutes DEFAULT (60);

    IF COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkout_delay_minutes') IS NULL
        ALTER TABLE dbo.company_settings
            ADD admin_missing_checkout_delay_minutes INT NOT NULL
                CONSTRAINT DF_cs_admin_missing_checkout_delay_minutes DEFAULT (30);

    IF COL_LENGTH(N'dbo.company_settings', N'admin_alert_max_lateness_minutes') IS NULL
        ALTER TABLE dbo.company_settings
            ADD admin_alert_max_lateness_minutes INT NOT NULL
                CONSTRAINT DF_cs_admin_alert_max_lateness_minutes DEFAULT (60);
END;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_admin_confirmation_escalation_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings
            ADD CONSTRAINT CK_cs_admin_confirmation_escalation_minutes
                CHECK (admin_confirmation_escalation_minutes >= 0 AND admin_confirmation_escalation_minutes <= 1440);

    IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_admin_missing_checkout_delay_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings
            ADD CONSTRAINT CK_cs_admin_missing_checkout_delay_minutes
                CHECK (admin_missing_checkout_delay_minutes >= 0 AND admin_missing_checkout_delay_minutes <= 720);

    IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_admin_alert_max_lateness_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings
            ADD CONSTRAINT CK_cs_admin_alert_max_lateness_minutes
                CHECK (admin_alert_max_lateness_minutes >= 1 AND admin_alert_max_lateness_minutes <= 720);
END;
GO

/* ---- Expand outbox alert_type CHECK ---- */
IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name = N'CK_waan_alert_type'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
   )
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        DROP CONSTRAINT CK_waan_alert_type;
END;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        ADD CONSTRAINT CK_waan_alert_type
            CHECK (alert_type IN (
                N'EMPLOYEE_UNAVAILABLE',
                N'MISSING_CHECKIN_AFTER_OPERATION',
                N'FORWARDED_LOCATION_REJECTED',
                N'ABSENCE_REQUEST_PENDING',
                N'ATTENDANCE_THRESHOLD_CROSSED',
                N'ATTENDANCE_CONFIRMATION_MISSING',
                N'MISSING_CHECKIN_AFTER_START',
                N'MISSING_CHECKOUT_AFTER_END'
            ));
END;
GO
