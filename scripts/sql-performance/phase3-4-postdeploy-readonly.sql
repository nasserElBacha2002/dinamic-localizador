-- =============================================================================
-- Phase 3/4 post-deploy READ-ONLY validation (SQL Server 2022)
-- =============================================================================
-- Purpose: compare SQL work BEFORE vs AFTER Phases 3–4 (workers + indexes).
-- Safe: no INSERT/UPDATE/DELETE/DDL. No SHRINK. No UPDATE STATISTICS.
--
-- IMPORTANT semantics:
--   - logical writes ≠ transaction log bytes
--   - user_updates ≠ leaf row modifications (cross-check operational stats)
--   - missing-index DMVs are NOT consulted here
--
-- Usage:
--   sqlcmd -S ... -d dinamic_attendance -E -i scripts/sql-performance/phase3-4-postdeploy-readonly.sql
-- =============================================================================

SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

DECLARE @dbid INT = DB_ID();
DECLARE @minPagesForFrag INT = 100; -- ignore tiny indexes for fragmentation noise

PRINT '=== 0. Query Store availability ===';
SELECT
  actual_state_desc,
  readonly_reason,
  current_storage_size_mb,
  max_storage_size_mb
FROM sys.database_query_store_options;

PRINT '=== 1. Top queries by execution_count / logical reads / CPU / duration ===';
-- Prefer Query Store when available; fall back to plan cache.
IF EXISTS (
  SELECT 1 FROM sys.database_query_store_options WHERE actual_state_desc IN (N'READ_WRITE', N'READ_ONLY')
)
BEGIN
  ;WITH qs AS (
    SELECT TOP (40)
      q.query_id,
      qt.query_sql_text,
      SUM(rs.count_executions) AS execution_count,
      SUM(rs.avg_logical_io_reads * rs.count_executions) AS total_logical_reads,
      SUM(rs.avg_logical_io_writes * rs.count_executions) AS total_logical_writes,
      SUM(rs.avg_cpu_time * rs.count_executions) AS total_cpu_us,
      SUM(rs.avg_duration * rs.count_executions) AS total_duration_us,
      AVG(rs.avg_logical_io_reads) AS avg_logical_reads,
      AVG(rs.avg_duration) AS avg_duration_us
    FROM sys.query_store_query q
    INNER JOIN sys.query_store_query_text qt ON qt.query_text_id = q.query_text_id
    INNER JOIN sys.query_store_plan p ON p.query_id = q.query_id
    INNER JOIN sys.query_store_runtime_stats rs ON rs.plan_id = p.plan_id
    INNER JOIN sys.query_store_runtime_stats_interval rsi
      ON rsi.runtime_stats_interval_id = rs.runtime_stats_interval_id
    WHERE rsi.start_time >= DATEADD(DAY, -7, SYSUTCDATETIME())
    GROUP BY q.query_id, qt.query_sql_text
    ORDER BY SUM(rs.avg_logical_io_reads * rs.count_executions) DESC
  )
  SELECT
    query_id,
    execution_count,
    CAST(total_logical_reads AS BIGINT) AS total_logical_reads,
    CAST(total_logical_writes AS BIGINT) AS total_logical_writes_not_log_bytes,
    CAST(total_cpu_us AS BIGINT) AS total_cpu_us,
    CAST(total_duration_us AS BIGINT) AS total_duration_us,
    CAST(avg_logical_reads AS BIGINT) AS avg_logical_reads,
    CAST(avg_duration_us AS BIGINT) AS avg_duration_us,
    LEFT(query_sql_text, 400) AS query_sql_text_prefix
  FROM qs
  ORDER BY total_logical_reads DESC;
END
ELSE
BEGIN
  SELECT TOP (40)
    qs.execution_count,
    qs.total_logical_reads,
    qs.total_logical_writes AS total_logical_writes_not_log_bytes,
    qs.total_worker_time AS total_cpu_us,
    qs.total_elapsed_time AS total_duration_us,
    CAST(qs.total_logical_reads * 1.0 / NULLIF(qs.execution_count, 0) AS BIGINT) AS avg_logical_reads,
    CAST(qs.total_elapsed_time * 1.0 / NULLIF(qs.execution_count, 0) AS BIGINT) AS avg_duration_us,
    LEFT(st.text, 400) AS query_sql_text_prefix
  FROM sys.dm_exec_query_stats qs
  CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
  WHERE st.dbid = @dbid OR st.dbid IS NULL
  ORDER BY qs.total_logical_reads DESC;
END;

PRINT '=== 2. Index usage (seeks/scans/lookups/user_updates) — focus tables ===';
SELECT
  OBJECT_SCHEMA_NAME(i.object_id) AS schema_name,
  OBJECT_NAME(i.object_id) AS table_name,
  i.name AS index_name,
  i.type_desc,
  ius.user_seeks,
  ius.user_scans,
  ius.user_lookups,
  ius.user_updates,
  ius.last_user_seek,
  ius.last_user_scan,
  ius.last_user_update
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats ius
  ON ius.database_id = @dbid
 AND ius.object_id = i.object_id
 AND ius.index_id = i.index_id
WHERE OBJECT_NAME(i.object_id) IN (
  N'absence_workday_sync_jobs',
  N'whatsapp_messages',
  N'whatsapp_message_cost_ledger',
  N'whatsapp_message_cost_sync_heartbeat',
  N'whatsapp_attendance_notifications',
  N'whatsapp_payroll_receipt_notifications',
  N'whatsapp_admin_alert_notifications',
  N'whatsapp_conversations',
  N'whatsapp_flow_executions',
  N'whatsapp_webhook_events',
  N'company_settings',
  N'operation_workdays',
  N'employee_workdays'
)
ORDER BY table_name, index_name;

PRINT '=== 3. Index operational stats (leaf insert/update/delete) ===';
SELECT
  OBJECT_NAME(ios.object_id) AS table_name,
  i.name AS index_name,
  ios.leaf_insert_count,
  ios.leaf_update_count,
  ios.leaf_delete_count,
  ios.leaf_page_merge_count,
  ios.range_scan_count,
  ios.singleton_lookup_count,
  ios.page_lock_wait_count,
  ios.row_lock_wait_count
FROM sys.dm_db_index_operational_stats(@dbid, NULL, NULL, NULL) ios
INNER JOIN sys.indexes i
  ON i.object_id = ios.object_id AND i.index_id = ios.index_id
WHERE OBJECT_NAME(ios.object_id) IN (
  N'absence_workday_sync_jobs',
  N'whatsapp_messages',
  N'whatsapp_message_cost_ledger',
  N'whatsapp_message_cost_sync_heartbeat',
  N'whatsapp_attendance_notifications',
  N'whatsapp_payroll_receipt_notifications',
  N'whatsapp_admin_alert_notifications',
  N'company_settings'
)
ORDER BY table_name, index_name;

PRINT '=== 4. Fragmentation (page_count >= @minPagesForFrag only) ===';
SELECT
  OBJECT_NAME(ps.object_id) AS table_name,
  i.name AS index_name,
  ps.index_type_desc,
  ps.page_count,
  CAST(ps.avg_fragmentation_in_percent AS DECIMAL(5, 1)) AS avg_fragmentation_pct,
  ps.avg_page_space_used_in_percent,
  ps.record_count
FROM sys.dm_db_index_physical_stats(@dbid, NULL, NULL, NULL, N'SAMPLED') ps
INNER JOIN sys.indexes i
  ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE ps.page_count >= @minPagesForFrag
  AND OBJECT_NAME(ps.object_id) IN (
    N'whatsapp_messages',
    N'whatsapp_message_cost_ledger',
    N'whatsapp_attendance_notifications',
    N'absence_workday_sync_jobs',
    N'audit_logs',
    N'system_runtime_logs'
  )
ORDER BY ps.page_count DESC, avg_fragmentation_pct DESC;

PRINT '=== 5. Statistics (last_updated / modification_counter) — focus tables ===';
SELECT
  OBJECT_NAME(s.object_id) AS table_name,
  s.name AS stats_name,
  sp.last_updated,
  sp.rows,
  sp.rows_sampled,
  sp.modification_counter,
  CASE
    WHEN sp.rows > 0
      THEN CAST(100.0 * sp.modification_counter / sp.rows AS DECIMAL(10, 2))
    ELSE NULL
  END AS modification_pct_of_rows
FROM sys.stats s
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE OBJECT_NAME(s.object_id) IN (
  N'absence_workday_sync_jobs',
  N'whatsapp_messages',
  N'whatsapp_message_cost_ledger',
  N'whatsapp_attendance_notifications',
  N'operation_workdays',
  N'employee_workdays',
  N'company_settings'
)
ORDER BY modification_counter DESC;

PRINT '=== 6. Table / index storage (rows, data MB, index MB) ===';
-- Prefer dm_db_partition_stats: correct allocation accounting without the
-- allocation_units.container_id = partitions.partition_id join pitfalls
-- (LOB/row-overflow miscounts and duplicated row_count).
SELECT
  OBJECT_NAME(ps.object_id) AS table_name,
  SUM(CASE WHEN ps.index_id IN (0, 1) THEN ps.row_count ELSE 0 END) AS row_count,
  CAST(SUM(CASE WHEN ps.index_id IN (0, 1) THEN ps.used_page_count ELSE 0 END)
       * 8.0 / 1024 AS DECIMAL(12, 2)) AS data_mb,
  CAST(SUM(CASE WHEN ps.index_id > 1 THEN ps.used_page_count ELSE 0 END)
       * 8.0 / 1024 AS DECIMAL(12, 2)) AS index_mb,
  CAST(SUM(ps.used_page_count) * 8.0 / 1024 AS DECIMAL(12, 2)) AS used_mb,
  CAST(SUM(ps.reserved_page_count) * 8.0 / 1024 AS DECIMAL(12, 2)) AS total_mb
FROM sys.dm_db_partition_stats ps
INNER JOIN sys.tables t ON t.object_id = ps.object_id
WHERE t.name IN (
  N'absence_workday_sync_jobs',
  N'whatsapp_messages',
  N'whatsapp_message_cost_ledger',
  N'whatsapp_attendance_notifications',
  N'whatsapp_payroll_receipt_notifications',
  N'whatsapp_admin_alert_notifications',
  N'whatsapp_conversations',
  N'whatsapp_flow_executions',
  N'audit_logs',
  N'system_runtime_logs',
  N'import_jobs',
  N'platform_audit_logs',
  N'company_settings'
)
GROUP BY ps.object_id
ORDER BY total_mb DESC;

PRINT '=== 7. Phase 3/4 index presence check ===';
SELECT
  i.name AS index_name,
  OBJECT_NAME(i.object_id) AS table_name,
  i.filter_definition,
  CASE WHEN i.name IS NOT NULL THEN N'PRESENT' ELSE N'MISSING' END AS status
FROM (VALUES
  (N'IX_wm_outbound_sent_at', N'whatsapp_messages'),
  (N'IX_wan_company_sent_recovery', N'whatsapp_attendance_notifications'),
  (N'IX_wc_active_last_activity', N'whatsapp_conversations'),
  (N'IX_wfe_started_unfinished', N'whatsapp_flow_executions')
) expected(index_name, table_name)
LEFT JOIN sys.indexes i
  ON i.name = expected.index_name
 AND i.object_id = OBJECT_ID(N'dbo.' + expected.table_name);

PRINT '=== 8. Storage classification (A/B/C/D) — documentation only ===';
/*
  A. TTL already implemented:
     - whatsapp_* lifecycle + retention cleanup (messages/conversations/flows/webhooks)
     - system_runtime_logs retention job
     - absence attachment cleanup
  B. Technical TTL candidates (ops decision, not attendance history):
     - import_jobs (completed/failed artifacts)
     - rate_limit_buckets (already cleaned)
  C. Functional/auditable history — retain:
     - attendance_records / employee_workdays / operation_workdays
     - audit_logs / platform_audit_logs (policy-driven)
     - whatsapp_message_cost_ledger (billing evidence)
     - payroll receipt notifications (delivery evidence)
  D. Requires business decision:
     - daily/monthly attendance report snapshots retention window
     - admin alert notification history depth
     - conversation message retention beyond current WHATSAPP_RETENTION_DAYS
*/

PRINT '=== Done (READ-ONLY). Remember: logical writes are NOT transaction-log bytes. ===';
