-- Widen notification status column for SENT_RECOVERY_REQUIRED

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_attendance_notifications')
      AND name = 'status'
      AND max_length < 64
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        ALTER COLUMN status NVARCHAR(32) NOT NULL;
END;
GO
