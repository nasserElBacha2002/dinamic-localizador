-- 078: Cursor-stable index for WhatsApp observability message history.
-- Replaces IX_wm_conversation_created (conversation_id, created_at) with an index that includes id
-- for deterministic tie-breaking in created_at DESC, id DESC cursor pagination.

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_wm_conversation_created'
      AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
BEGIN
    DROP INDEX IX_wm_conversation_created ON dbo.whatsapp_messages;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_wm_conversation_created_id'
      AND object_id = OBJECT_ID('dbo.whatsapp_messages')
)
BEGIN
    CREATE INDEX IX_wm_conversation_created_id
        ON dbo.whatsapp_messages (conversation_id, created_at DESC, id DESC);
END
GO
