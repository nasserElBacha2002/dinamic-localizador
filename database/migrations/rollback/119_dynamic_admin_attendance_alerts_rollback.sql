/*
  Rollback: 119_dynamic_admin_attendance_alerts_rollback.sql

  Cannot shrink CK_waan_alert_type while new alert_type rows exist.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1
        FROM dbo.whatsapp_admin_alert_notifications
        WHERE alert_type IN (
            N'ATTENDANCE_CONFIRMATION_MISSING',
            N'MISSING_CHECKIN_AFTER_START',
            N'MISSING_CHECKOUT_AFTER_END'
        )
   )
BEGIN
    THROW 50119, 'Cannot rollback: dynamic admin attendance alert outbox rows exist', 1;
END;
GO

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

    ALTER TABLE dbo.whatsapp_admin_alert_notifications
        ADD CONSTRAINT CK_waan_alert_type
            CHECK (alert_type IN (
                N'EMPLOYEE_UNAVAILABLE',
                N'MISSING_CHECKIN_AFTER_OPERATION',
                N'FORWARDED_LOCATION_REJECTED',
                N'ABSENCE_REQUEST_PENDING',
                N'ATTENDANCE_THRESHOLD_CROSSED'
            ));
END;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_admin_confirmation_escalation_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_admin_confirmation_escalation_minutes;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_admin_missing_checkout_delay_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_admin_missing_checkout_delay_minutes;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_admin_alert_max_lateness_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_admin_alert_max_lateness_minutes;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_admin_att_conf_missing_enabled'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_admin_att_conf_missing_enabled;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_admin_missing_checkin_enabled'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_admin_missing_checkin_enabled;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_admin_missing_checkout_enabled'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_admin_missing_checkout_enabled;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_admin_conf_escalation_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_admin_conf_escalation_minutes;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_admin_missing_checkout_delay_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_admin_missing_checkout_delay_minutes;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_admin_alert_max_lateness_minutes'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_admin_alert_max_lateness_minutes;

    IF COL_LENGTH(N'dbo.company_settings', N'admin_attendance_confirmation_missing_enabled') IS NOT NULL
        ALTER TABLE dbo.company_settings DROP COLUMN admin_attendance_confirmation_missing_enabled;

    IF COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkin_enabled') IS NOT NULL
        ALTER TABLE dbo.company_settings DROP COLUMN admin_missing_checkin_enabled;

    IF COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkout_enabled') IS NOT NULL
        ALTER TABLE dbo.company_settings DROP COLUMN admin_missing_checkout_enabled;

    IF COL_LENGTH(N'dbo.company_settings', N'admin_confirmation_escalation_minutes') IS NOT NULL
        ALTER TABLE dbo.company_settings DROP COLUMN admin_confirmation_escalation_minutes;

    IF COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkout_delay_minutes') IS NOT NULL
        ALTER TABLE dbo.company_settings DROP COLUMN admin_missing_checkout_delay_minutes;

    IF COL_LENGTH(N'dbo.company_settings', N'admin_alert_max_lateness_minutes') IS NOT NULL
        ALTER TABLE dbo.company_settings DROP COLUMN admin_alert_max_lateness_minutes;
END;
GO
