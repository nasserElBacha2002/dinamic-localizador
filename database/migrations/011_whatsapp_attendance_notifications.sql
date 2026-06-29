USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_attendance_notifications')
BEGIN
    CREATE TABLE whatsapp_attendance_notifications (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_whatsapp_attendance_notifications PRIMARY KEY DEFAULT NEWID(),
        inventory_id UNIQUEIDENTIFIER NOT NULL,
        employee_id UNIQUEIDENTIFIER NOT NULL,
        notification_type NVARCHAR(40) NOT NULL,
        twilio_message_sid NVARCHAR(100) NULL,
        status NVARCHAR(20) NOT NULL,
        error_message NVARCHAR(1000) NULL,
        sent_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_whatsapp_attendance_notifications_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_whatsapp_attendance_notifications_inventory
            FOREIGN KEY (inventory_id) REFERENCES inventories (id),
        CONSTRAINT FK_whatsapp_attendance_notifications_employee
            FOREIGN KEY (employee_id) REFERENCES employees (id),
        CONSTRAINT CK_whatsapp_attendance_notifications_type
            CHECK (notification_type IN ('ARRIVAL_REMINDER_15_MIN', 'EXIT_REMINDER_15_MIN')),
        CONSTRAINT CK_whatsapp_attendance_notifications_status
            CHECK (status IN ('PENDING', 'SENT', 'FAILED'))
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_whatsapp_attendance_notifications_inventory_employee_type'
      AND object_id = OBJECT_ID('whatsapp_attendance_notifications')
)
BEGIN
    CREATE UNIQUE INDEX UQ_whatsapp_attendance_notifications_inventory_employee_type
        ON whatsapp_attendance_notifications (inventory_id, employee_id, notification_type);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_whatsapp_attendance_notifications_status'
      AND object_id = OBJECT_ID('whatsapp_attendance_notifications')
)
BEGIN
    CREATE INDEX IX_whatsapp_attendance_notifications_status
        ON whatsapp_attendance_notifications (status, created_at);
END;
GO
