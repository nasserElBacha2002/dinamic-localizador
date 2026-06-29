USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_attendance_notifications')
      AND name = 'attempt_count'
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        ADD attempt_count INT NOT NULL
            CONSTRAINT DF_whatsapp_attendance_notifications_attempt_count DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_attendance_notifications')
      AND name = 'last_attempt_at'
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        ADD last_attempt_at DATETIME2 NULL;
END;
GO

UPDATE whatsapp_attendance_notifications
SET sent_at = NULL
WHERE status <> 'SENT'
  AND sent_at IS NOT NULL;
GO
