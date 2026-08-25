/*
  Migration: 102_admin_alert_absence_request_pending.sql
  Purpose:
    - Extend whatsapp_admin_alert_notifications alert_type CHECK for Phase C.
  Preconditions:
    - 101_whatsapp_admin_alert_notifications.sql applied
  Rollback: database/migrations/rollback/102_admin_alert_absence_request_pending_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NULL
BEGIN
    THROW 50102, 'Precondition failed: whatsapp_admin_alert_notifications missing (apply 101 first)', 1;
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
            N'FORWARDED_LOCATION_REJECTED',
            N'ABSENCE_REQUEST_PENDING'
        ));
GO
