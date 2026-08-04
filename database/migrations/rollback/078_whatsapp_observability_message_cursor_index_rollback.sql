-- Rollback 078: restore previous conversation/created_at index without id.

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_wm_conversation_created_id'
      AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
BEGIN
    DROP INDEX IX_wm_conversation_created_id ON dbo.whatsapp_messages;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_wm_conversation_created'
      AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_wm_conversation_created
        ON dbo.whatsapp_messages (conversation_id, created_at);
END
GO
