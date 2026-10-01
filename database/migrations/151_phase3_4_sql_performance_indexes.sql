/*
  Migration: 151_phase3_4_sql_performance_indexes.sql
  Purpose (Phases 3–4 SQL performance):
    Add narrow indexes justified by reconstructed hot queries — not DMV copies.

  Justified indexes:
    1. IX_wm_outbound_sent_at
       Query: whatsapp-message-cost-reconcile outbound messages without ledger.
       Predicate: direction = OUTBOUND; ORDER BY COALESCE(sent_at, created_at).
    2. IX_wan_company_sent_recovery
       Query: reconcileSentRecoveryRequired / hasAnySentRecoveryRequired.
       Predicate: status = SENT_RECOVERY_REQUIRED (rare); company_id filter.
    3. IX_wc_active_last_activity
       Query: whatsapp lifecycle completeIdleActiveConversations.
       Predicate: status = ACTIVE AND last_activity_at < cutoff.
    4. IX_wfe_started_unfinished
       Query: whatsapp lifecycle failAbandonedStartedFlows.
       Predicate: status = STARTED AND finished_at IS NULL AND started_at < cutoff.

  Explicitly NOT in this migration:
    - Dropping low-read secondary indexes (insufficient evidence vs constraints).
    - REBUILD of whatsapp_messages PK (fragmentation caused by NEWID() random GUID;
      ~5k rows — architectural note only; no destructive clustered key change).
    - Extra cost_ledger indexes from missing-index DMV (IX_wmcl_sync_claim /
      UX_wmcl_provider_message_sid / IX_wmcl_company_sent_at already cover
      claim + anti-join + monthly summary paths).
    - IX_wwe_processing_expires already covers webhook lifecycle.

  Rollback: database/migrations/rollback/151_phase3_4_sql_performance_indexes_rollback.sql
*/

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_messages: outbound reconcile / cost ledger gap scan
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.whatsapp_messages', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wm_outbound_sent_at'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_messages')
   )
BEGIN
    CREATE NONCLUSTERED INDEX IX_wm_outbound_sent_at
        ON dbo.whatsapp_messages (sent_at, created_at)
        INCLUDE (
            company_id,
            provider_message_sid,
            message_sid,
            phone_to,
            message_type,
            template_sid,
            template_name,
            provider_status
        )
        WHERE direction = N'OUTBOUND';
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_attendance_notifications: SENT_RECOVERY_REQUIRED reconcile
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.whatsapp_attendance_notifications', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wan_company_sent_recovery'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_attendance_notifications')
   )
BEGIN
    CREATE NONCLUSTERED INDEX IX_wan_company_sent_recovery
        ON dbo.whatsapp_attendance_notifications (company_id)
        WHERE status = N'SENT_RECOVERY_REQUIRED';
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_conversations: idle ACTIVE lifecycle (Phase 2 retention unblock)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.whatsapp_conversations', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wc_active_last_activity'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_conversations')
   )
BEGIN
    CREATE NONCLUSTERED INDEX IX_wc_active_last_activity
        ON dbo.whatsapp_conversations (last_activity_at)
        WHERE status = N'ACTIVE';
END;
GO

-- ---------------------------------------------------------------------------
-- whatsapp_flow_executions: abandoned STARTED lifecycle
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.whatsapp_flow_executions', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_wfe_started_unfinished'
          AND object_id = OBJECT_ID(N'dbo.whatsapp_flow_executions')
   )
BEGIN
    CREATE NONCLUSTERED INDEX IX_wfe_started_unfinished
        ON dbo.whatsapp_flow_executions (started_at)
        WHERE status = N'STARTED'
          AND finished_at IS NULL;
END;
GO
