/*
  Rollback: 151_phase3_4_sql_performance_indexes_rollback.sql
  Drops only indexes created by 151. Safe / idempotent.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wfe_started_unfinished'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_flow_executions')
)
    DROP INDEX IX_wfe_started_unfinished ON dbo.whatsapp_flow_executions;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wc_active_last_activity'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_conversations')
)
    DROP INDEX IX_wc_active_last_activity ON dbo.whatsapp_conversations;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wan_company_sent_recovery'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
)
    DROP INDEX IX_wan_company_sent_recovery ON dbo.whatsapp_attendance_notifications;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_wm_outbound_sent_at'
      AND object_id = OBJECT_ID(N'dbo.whatsapp_messages')
)
    DROP INDEX IX_wm_outbound_sent_at ON dbo.whatsapp_messages;
GO
