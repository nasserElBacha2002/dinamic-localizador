-- Rollback 076_whatsapp_observability_foundation.sql

USE dinamic_attendance;
GO

IF OBJECT_ID('dbo.whatsapp_provider_events', 'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_provider_events;
GO

IF OBJECT_ID('dbo.whatsapp_flow_candidates', 'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_flow_candidates;
GO

IF OBJECT_ID('dbo.whatsapp_flow_steps', 'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_flow_steps;
GO

IF OBJECT_ID('dbo.whatsapp_flow_executions', 'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_flow_executions;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_whatsapp_messages_conversation'
)
BEGIN
    ALTER TABLE dbo.whatsapp_messages DROP CONSTRAINT FK_whatsapp_messages_conversation;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wm_conversation_created' AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
    DROP INDEX IX_wm_conversation_created ON dbo.whatsapp_messages;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wm_correlation_id' AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
    DROP INDEX IX_wm_correlation_id ON dbo.whatsapp_messages;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wm_provider_message_sid' AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
    DROP INDEX IX_wm_provider_message_sid ON dbo.whatsapp_messages;
GO

DECLARE @cols TABLE (name SYSNAME);
INSERT INTO @cols (name) VALUES
    (N'conversation_id'), (N'correlation_id'), (N'causation_id'), (N'provider'),
    (N'provider_message_sid'), (N'template_sid'), (N'template_name'), (N'template_variables_json'),
    (N'provider_status'), (N'provider_error_code'), (N'provider_error_message'),
    (N'sent_at'), (N'delivered_at'), (N'read_at'), (N'failed_at'), (N'updated_at'), (N'notification_id');

DECLARE @name SYSNAME;
DECLARE col_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @cols;
OPEN col_cursor;
FETCH NEXT FROM col_cursor INTO @name;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.whatsapp_messages') AND name = @name
    )
    BEGIN
        DECLARE @sql NVARCHAR(300) = N'ALTER TABLE dbo.whatsapp_messages DROP COLUMN ' + QUOTENAME(@name) + N';';
        EXEC sp_executesql @sql;
    END
    FETCH NEXT FROM col_cursor INTO @name;
END
CLOSE col_cursor;
DEALLOCATE col_cursor;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'conversation_id'
)
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN conversation_id;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'correlation_id'
)
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN correlation_id;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.whatsapp_attendance_notifications') AND name = 'outbound_message_id'
)
    ALTER TABLE dbo.whatsapp_attendance_notifications DROP COLUMN outbound_message_id;
GO

IF OBJECT_ID('dbo.whatsapp_conversations', 'U') IS NOT NULL
    DROP TABLE dbo.whatsapp_conversations;
GO
