/*
  Rollback: 102_admin_alert_absence_request_pending_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NULL
BEGIN
    RETURN;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.whatsapp_admin_alert_notifications
    WHERE alert_type = N'ABSENCE_REQUEST_PENDING'
)
BEGIN
    THROW 50102, 'Cannot rollback: ABSENCE_REQUEST_PENDING rows exist', 1;
END;
GO

IF EXISTS (
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

ALTER TABLE dbo.whatsapp_admin_alert_notifications
    ADD CONSTRAINT CK_waan_alert_type
        CHECK (alert_type IN (
            N'EMPLOYEE_UNAVAILABLE',
            N'MISSING_CHECKIN_AFTER_OPERATION',
            N'FORWARDED_LOCATION_REJECTED'
        ));
GO
