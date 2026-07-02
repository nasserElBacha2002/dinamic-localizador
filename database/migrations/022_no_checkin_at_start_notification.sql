USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_whatsapp_attendance_notifications_type'
      AND parent_object_id = OBJECT_ID('whatsapp_attendance_notifications')
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        DROP CONSTRAINT CK_whatsapp_attendance_notifications_type;
END;
GO

ALTER TABLE whatsapp_attendance_notifications
    ADD CONSTRAINT CK_whatsapp_attendance_notifications_type
        CHECK (notification_type IN (
            'ARRIVAL_REMINDER_15_MIN',
            'EXIT_REMINDER_15_MIN',
            'NO_CHECKIN_AT_START'
        ));
GO
