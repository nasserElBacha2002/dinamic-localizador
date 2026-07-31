-- Allow SUPERSEDED status for WhatsApp attendance notifications invalidated by
-- schedule changes (distinct from FAILED = technical send/persistence failure).

USE dinamic_attendance;
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

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_whatsapp_attendance_notifications_status'
      AND parent_object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications')
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        ADD CONSTRAINT CK_whatsapp_attendance_notifications_status
        CHECK (status IN (
            'PENDING',
            'SENT',
            'FAILED',
            'SENT_RECOVERY_REQUIRED',
            'SUPERSEDED'
        ));
END;
GO
