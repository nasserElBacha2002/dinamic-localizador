-- Observability corrections: widen encrypted phone storage, notification provider projection,
-- and safe FKs for observability linkage.

USE dinamic_attendance;
GO

-- phone_normalized now stores ciphertext (v1:...) — widen column
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_conversations') AND name = 'phone_normalized'
)
BEGIN
    ALTER TABLE dbo.whatsapp_conversations ALTER COLUMN phone_normalized NVARCHAR(512) NOT NULL;
END;
GO

-- Provider delivery projection on notifications (distinct from SENT = API accepted)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_status'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD provider_status NVARCHAR(40) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_error_code'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD provider_error_code NVARCHAR(40) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_error_message'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD provider_error_message NVARCHAR(1000) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_updated_at'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications ADD provider_updated_at DATETIME2 NULL;
END;
GO

-- Safe FKs for observability linkage (ON DELETE SET NULL where historical refs must survive domain deletes)
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wan_conversation'
)
BEGIN
    ALTER TABLE dbo.whatsapp_attendance_notifications
        ADD CONSTRAINT FK_wan_conversation
        FOREIGN KEY (conversation_id) REFERENCES dbo.whatsapp_conversations (id);
END;
GO

-- Historical/snapshot refs deliberately without FK (documented):
-- whatsapp_messages.notification_id <-> notifications.outbound_message_id (circular)
-- flow_executions.session_id, operation_id, workday_id, attendance_id (domain entities may be archived)

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wfe_source_message'
)
BEGIN
    ALTER TABLE dbo.whatsapp_flow_executions
        ADD CONSTRAINT FK_wfe_source_message
        FOREIGN KEY (source_message_id) REFERENCES dbo.whatsapp_messages (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wfe_notification'
)
BEGIN
    ALTER TABLE dbo.whatsapp_flow_executions
        ADD CONSTRAINT FK_wfe_notification
        FOREIGN KEY (notification_id) REFERENCES dbo.whatsapp_attendance_notifications (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wfe_employee'
)
BEGIN
    ALTER TABLE dbo.whatsapp_flow_executions
        ADD CONSTRAINT FK_wfe_employee
        FOREIGN KEY (employee_id) REFERENCES dbo.employees (id);
END;
GO
