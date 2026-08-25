/*
  Rollback: 104_admin_alert_attendance_threshold_rollback.sql

  Safe restore only:
    - Drops queue + state tables when empty of pending alerts is not required
      (tables are Phase D–only; drop is allowed).
    - Reverts CK_waan_alert_type only if no ATTENDANCE_THRESHOLD_CROSSED rows exist.
    - Removes company_settings columns only when no Phase D rows reference them
      (columns are independent; drop after tables).

  Cannot shrink CK while ATTENDANCE_THRESHOLD_CROSSED outbox rows exist.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1
        FROM dbo.whatsapp_admin_alert_notifications
        WHERE alert_type = N'ATTENDANCE_THRESHOLD_CROSSED'
   )
BEGIN
    THROW 50104, 'Cannot rollback: ATTENDANCE_THRESHOLD_CROSSED outbox rows exist', 1;
END;
GO

IF OBJECT_ID(N'dbo.attendance_alert_evaluation_queue', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.attendance_alert_evaluation_queue;
END;
GO

IF OBJECT_ID(N'dbo.employee_attendance_alert_state', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.employee_attendance_alert_state;
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
                N'ABSENCE_REQUEST_PENDING'
            ));
END;
GO

IF OBJECT_ID(N'dbo.company_settings', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_attendance_alert_threshold_percent'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_attendance_alert_threshold_percent;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_attendance_alert_window_days'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_attendance_alert_window_days;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_attendance_alert_minimum_workdays'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_attendance_alert_minimum_workdays;

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_cs_attendance_alert_cooldown_days'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT CK_cs_attendance_alert_cooldown_days;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_attendance_threshold_alerts_enabled'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_attendance_threshold_alerts_enabled;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_attendance_alert_threshold_percent'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_attendance_alert_threshold_percent;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_attendance_alert_window_days'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_attendance_alert_window_days;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_attendance_alert_minimum_workdays'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_attendance_alert_minimum_workdays;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_attendance_alert_cooldown_days'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_attendance_alert_cooldown_days;

    IF EXISTS (
        SELECT 1 FROM sys.default_constraints
        WHERE name = N'DF_cs_attendance_alert_config_version'
          AND parent_object_id = OBJECT_ID(N'dbo.company_settings')
    )
        ALTER TABLE dbo.company_settings DROP CONSTRAINT DF_cs_attendance_alert_config_version;

    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.company_settings')
          AND name = N'attendance_threshold_alerts_enabled'
    )
        ALTER TABLE dbo.company_settings DROP COLUMN attendance_threshold_alerts_enabled;

    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.company_settings')
          AND name = N'attendance_alert_threshold_percent'
    )
        ALTER TABLE dbo.company_settings DROP COLUMN attendance_alert_threshold_percent;

    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.company_settings')
          AND name = N'attendance_alert_window_days'
    )
        ALTER TABLE dbo.company_settings DROP COLUMN attendance_alert_window_days;

    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.company_settings')
          AND name = N'attendance_alert_minimum_workdays'
    )
        ALTER TABLE dbo.company_settings DROP COLUMN attendance_alert_minimum_workdays;

    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.company_settings')
          AND name = N'attendance_alert_cooldown_days'
    )
        ALTER TABLE dbo.company_settings DROP COLUMN attendance_alert_cooldown_days;

    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.company_settings')
          AND name = N'attendance_alert_config_version'
    )
        ALTER TABLE dbo.company_settings DROP COLUMN attendance_alert_config_version;
END;
GO
