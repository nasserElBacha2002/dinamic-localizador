/*
  Rollback: 073_absence_phase6_whatsapp_foundation_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_wwe_company_status_created'
      AND object_id = OBJECT_ID('dbo.whatsapp_webhook_events')
)
BEGIN
    DROP INDEX IX_wwe_company_status_created ON dbo.whatsapp_webhook_events;
END;
GO

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'whatsapp_webhook_events')
BEGIN
    DROP TABLE dbo.whatsapp_webhook_events;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_sessions')
      AND name = 'last_message_sid'
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP COLUMN last_message_sid;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_bot_sessions_session_version'
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP CONSTRAINT DF_bot_sessions_session_version;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.bot_sessions')
      AND name = 'session_version'
)
BEGIN
    ALTER TABLE dbo.bot_sessions DROP COLUMN session_version;
END;
GO
