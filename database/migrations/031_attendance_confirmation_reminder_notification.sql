-- Attendance confirmation reminder notification type + schedule version idempotency

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_attendance_notifications') AND name = 'schedule_version'
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        ADD schedule_version INT NOT NULL
            CONSTRAINT DF_whatsapp_attendance_notifications_schedule_version DEFAULT 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('whatsapp_attendance_notifications') AND name = 'reminder_source'
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        ADD reminder_source NVARCHAR(20) NULL;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
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
        'NO_CHECKIN_AT_START',
        'ATTENDANCE_CONFIRMATION_REMINDER'
    ));
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_whatsapp_attendance_notifications_reminder_source'
      AND parent_object_id = OBJECT_ID('whatsapp_attendance_notifications')
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        DROP CONSTRAINT CK_whatsapp_attendance_notifications_reminder_source;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_whatsapp_attendance_notifications_reminder_source'
)
BEGIN
    ALTER TABLE whatsapp_attendance_notifications
        ADD CONSTRAINT CK_whatsapp_attendance_notifications_reminder_source
        CHECK (reminder_source IS NULL OR reminder_source IN ('AUTOMATIC', 'MANUAL'));
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_whatsapp_attendance_notifications_inventory_employee_type'
      AND object_id = OBJECT_ID('whatsapp_attendance_notifications')
)
BEGIN
    DROP INDEX UQ_whatsapp_attendance_notifications_inventory_employee_type
        ON whatsapp_attendance_notifications;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_whatsapp_attendance_notifications_inventory_employee_type_version'
      AND object_id = OBJECT_ID('whatsapp_attendance_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_inventory_employee_type_version
        ON whatsapp_attendance_notifications (inventory_id, employee_id, notification_type, schedule_version);
END;
GO

UPDATE whatsapp_attendance_notifications
SET schedule_version = 1
WHERE schedule_version IS NULL OR schedule_version < 1;
GO
