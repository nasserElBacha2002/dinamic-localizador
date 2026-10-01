-- READ-ONLY evidence for migration 151 indexes.
-- Does not CREATE/DROP/ALTER. Safe for staging/prod snapshots.
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

PRINT '=== 151 index presence ===';
SELECT
  expected.index_name,
  expected.table_name,
  CASE WHEN i.object_id IS NULL THEN N'MISSING' ELSE N'PRESENT' END AS status,
  i.filter_definition,
  i.type_desc
FROM (VALUES
  (N'IX_wm_outbound_sent_at', N'whatsapp_messages'),
  (N'IX_wan_company_sent_recovery', N'whatsapp_attendance_notifications'),
  (N'IX_wc_active_last_activity', N'whatsapp_conversations'),
  (N'IX_wfe_started_unfinished', N'whatsapp_flow_executions')
) expected(index_name, table_name)
LEFT JOIN sys.indexes i
  ON i.name = expected.index_name
 AND i.object_id = OBJECT_ID(N'dbo.' + expected.table_name);

PRINT '=== 151 index usage (since last SQL restart) ===';
SELECT
  OBJECT_NAME(i.object_id) AS table_name,
  i.name AS index_name,
  ius.user_seeks,
  ius.user_scans,
  ius.user_lookups,
  ius.user_updates
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats ius
  ON ius.database_id = DB_ID()
 AND ius.object_id = i.object_id
 AND ius.index_id = i.index_id
WHERE i.name IN (
  N'IX_wm_outbound_sent_at',
  N'IX_wan_company_sent_recovery',
  N'IX_wc_active_last_activity',
  N'IX_wfe_started_unfinished'
)
ORDER BY i.name;

PRINT '=== Outbound reconcile shape note ===';
PRINT 'Query uses ORDER BY COALESCE(sent_at, created_at).';
PRINT 'IX_wm_outbound_sent_at (sent_at, created_at) WHERE OUTBOUND may cover/filter';
PRINT 'but does NOT guarantee sort elimination when sent_at is NULL.';

-- Estimated plan probe (READ-ONLY): SET SHOWPLAN_XML requires special permissions;
-- use SET STATISTICS IO ON in a disposable session if allowed.
PRINT '=== Candidate SQL for STATISTICS IO (run manually if permitted) ===';
PRINT 'SET STATISTICS IO ON;';
PRINT 'SELECT TOP (20) m.id FROM dbo.whatsapp_messages m';
PRINT 'WHERE m.direction = N''OUTBOUND'' AND ( ... anti-join ... )';
PRINT 'ORDER BY COALESCE(m.sent_at, m.created_at);';
