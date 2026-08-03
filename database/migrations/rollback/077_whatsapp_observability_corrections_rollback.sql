-- Rollback 077_whatsapp_observability_corrections.sql

USE dinamic_attendance;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wfe_employee')
    ALTER TABLE dbo.whatsapp_flow_executions DROP CONSTRAINT FK_wfe_employee;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wfe_notification')
    ALTER TABLE dbo.whatsapp_flow_executions DROP CONSTRAINT FK_wfe_notification;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wfe_source_message')
    ALTER TABLE dbo.whatsapp_flow_executions DROP CONSTRAINT FK_wfe_source_message;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_wan_conversation')
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP CONSTRAINT FK_wan_conversation;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_updated_at'
)
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN provider_updated_at;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_error_message'
)
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN provider_error_message;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_error_code'
)
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN provider_error_code;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'provider_status'
)
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN provider_status;
GO

-- Narrowing phone_normalized back may fail if ciphertext present; leave widened on rollback.
GO
