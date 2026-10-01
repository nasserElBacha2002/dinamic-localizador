-- WhatsApp retention / lifecycle post-deploy READ-ONLY checks.
-- Does not DELETE, UPDATE, or purge. Safe to run against production.
-- Parameter: retention days (default 30) via the @retentionDays variable below.

SET NOCOUNT ON;

DECLARE @retentionDays INT = 30;
DECLARE @cutoff DATETIME2 = DATEADD(DAY, -@retentionDays, SYSUTCDATETIME());

SELECT 'params' AS section, @retentionDays AS retention_days, @cutoff AS cutoff_utc;

-- ACTIVE conversations older than retention window
SELECT
  'active_conversations_gt_retention' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_conversations
WHERE status = N'ACTIVE'
  AND last_activity_at < @cutoff;

-- Messages older than retention blocked solely by ACTIVE conversation
SELECT
  'messages_gt_retention_blocked_by_active' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_messages m
INNER JOIN dbo.whatsapp_conversations c ON c.id = m.conversation_id
WHERE m.created_at < @cutoff
  AND c.status = N'ACTIVE';

-- Messages older than retention eligible under current purge guards
SELECT
  'messages_gt_retention_eligible' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_messages m
WHERE m.created_at < @cutoff
  AND NOT EXISTS (
    SELECT 1 FROM dbo.whatsapp_conversations c
    WHERE c.id = m.conversation_id AND c.status = N'ACTIVE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM dbo.whatsapp_provider_events pe WHERE pe.message_id = m.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM dbo.whatsapp_flow_executions fe WHERE fe.source_message_id = m.id
  );

SELECT
  'flows_started_gt_retention' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_flow_executions
WHERE status = N'STARTED'
  AND started_at < @cutoff
  AND finished_at IS NULL;

SELECT
  'webhooks_processing_gt_retention' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_webhook_events
WHERE processing_status = N'PROCESSING'
  AND created_at < @cutoff;

SELECT
  'webhooks_processing_lease_expired' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_webhook_events
WHERE processing_status = N'PROCESSING'
  AND processing_expires_at IS NOT NULL
  AND processing_expires_at < SYSUTCDATETIME();

SELECT
  'payroll_failed_gt_retention_total' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_payroll_receipt_notifications
WHERE status = N'FAILED'
  AND COALESCE(sent_at, updated_at, created_at) < @cutoff;

SELECT
  'payroll_failed_gt_retention_eligible' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_payroll_receipt_notifications n
WHERE n.status = N'FAILED'
  AND (
    n.attempt_count >= 5
    OR n.next_attempt_at IS NULL
  )
  AND (n.lease_expires_at IS NULL OR n.lease_expires_at <= SYSUTCDATETIME())
  AND COALESCE(n.sent_at, n.updated_at, n.created_at) < @cutoff
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.whatsapp_payroll_receipt_notification_send_attempts a
    WHERE a.notification_id = n.id AND a.company_id = n.company_id
  );

SELECT
  'cost_ledger_total_rows' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_message_cost_ledger;

SELECT
  'cost_ledger_gt_365d' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_message_cost_ledger
WHERE sent_at < DATEADD(DAY, -365, SYSUTCDATETIME());

SELECT
  'cost_ledger_reserved_mb' AS metric,
  CAST(SUM(reserved_page_count) * 8.0 / 1024 AS decimal(18, 2)) AS value
FROM sys.dm_db_partition_stats
WHERE object_id = OBJECT_ID(N'dbo.whatsapp_message_cost_ledger');

SELECT
  'whatsapp_messages_reserved_mb' AS metric,
  CAST(SUM(reserved_page_count) * 8.0 / 1024 AS decimal(18, 2)) AS value
FROM sys.dm_db_partition_stats
WHERE object_id = OBJECT_ID(N'dbo.whatsapp_messages');

SELECT
  'whatsapp_conversations_reserved_mb' AS metric,
  CAST(SUM(reserved_page_count) * 8.0 / 1024 AS decimal(18, 2)) AS value
FROM sys.dm_db_partition_stats
WHERE object_id = OBJECT_ID(N'dbo.whatsapp_conversations');

SELECT
  'messages_gt_retention_total' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_messages
WHERE created_at < @cutoff;

SELECT
  'active_conversations_idle_gt_24h' AS metric,
  COUNT(*) AS value
FROM dbo.whatsapp_conversations
WHERE status = N'ACTIVE'
  AND last_activity_at < DATEADD(HOUR, -24, SYSUTCDATETIME());
