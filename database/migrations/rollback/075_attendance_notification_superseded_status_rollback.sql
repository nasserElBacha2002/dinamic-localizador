-- Rollback 075: remove SUPERSEDED from notification status check.
-- Rows already SUPERSEDED are remapped to FAILED for rollback safety
-- (same pattern as absence job SUPERSEDED rollback).

USE dinamic_attendance;
GO

UPDATE dbo.whatsapp_attendance_notifications
SET status = 'FAILED',
    error_message = COALESCE(error_message, 'SUPERSEDED_ROLLBACK')
WHERE status = 'SUPERSEDED';
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_whatsapp_attendance_notifications_status'
      AND parent_object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        DROP CONSTRAINT CK_whatsapp_attendance_notifications_status;
END;
GO

ALTER TABLE dbo.whatsapp_attendance_notifications
    ADD CONSTRAINT CK_whatsapp_attendance_notifications_status
    CHECK (status IN (
        'PENDING',
        'SENT',
        'FAILED',
        'SENT_RECOVERY_REQUIRED'
    ));
GO
