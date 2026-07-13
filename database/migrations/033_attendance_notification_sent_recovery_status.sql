-- Durable post-send recovery state for attendance notifications

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_whatsapp_attendance_notifications_status'
      AND parent_object_id = OBJECT_ID('whatsapp_attendance_notifications')
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        DROP CONSTRAINT CK_whatsapp_attendance_notifications_status;
END;
GO

ALTER TABLE whatsapp_attendance_notifications
    ADD CONSTRAINT CK_whatsapp_attendance_notifications_status
    CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SENT_RECOVERY_REQUIRED'));
GO
