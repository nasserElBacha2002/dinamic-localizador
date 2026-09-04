/*
  Database Retention Audit — READ-ONLY queries
  Database: dinamic_attendance (SQL Server)
  Generated from schema/migrations + code inspection (Aug 2026)

  SAFETY: This script contains ONLY SELECT / WITH / sys.* / INFORMATION_SCHEMA.*
  Do NOT add DELETE, TRUNCATE, UPDATE, INSERT, ALTER, DROP, or DBCC SHRINK*.

  Time basis: SYSUTCDATETIME() — application defaults to UTC (SYSUTCDATETIME in migrations).
  Run against staging/production during a low-traffic window for large tables.

  Sections:
    1. Global DB size
    2. Per-table size (correct row counts)
    3. Heavy MAX/BLOB columns
    4. Date columns inventory
    5. Foreign keys (WhatsApp / bot / observability chain)
    6. Index sizes (large tables)
    7. Age distribution (retention candidates)
    8. Monthly growth
    9. Payload size estimates (potentially expensive)
   10. Purge candidate summary
   11. Active / pending guards for future cleanup
*/

USE dinamic_attendance;
GO

SET NOCOUNT ON;

/* ============================================================================
   1. GLOBAL DATABASE SIZE
   Physical file size vs space used vs free space inside files
   ============================================================================ */

SELECT
    DB_NAME() AS database_name,
    SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS bigint)) * 8.0 / 1024 AS used_mb,
    SUM(size) * 8.0 / 1024 AS allocated_mb,
    SUM(size - CAST(FILEPROPERTY(name, 'SpaceUsed') AS bigint)) * 8.0 / 1024 AS free_in_files_mb
FROM sys.database_files;

SELECT
    name,
    type_desc,
    physical_name,
    size * 8.0 / 1024 AS size_mb,
    CAST(FILEPROPERTY(name, 'SpaceUsed') AS int) * 8.0 / 1024 AS used_mb,
    (size - CAST(FILEPROPERTY(name, 'SpaceUsed') AS int)) * 8.0 / 1024 AS free_in_file_mb,
    growth,
    max_size
FROM sys.database_files
ORDER BY type_desc, name;

/* ============================================================================
   2. PER-TABLE SIZE (correct row counts — heap/clustered index only)
   Avoids double-counting rows across nonclustered indexes
   ============================================================================ */

;WITH table_pages AS (
    SELECT
        s.name AS schema_name,
        t.name AS table_name,
        SUM(ps.row_count) AS row_count,
        SUM(ps.used_page_count) AS used_pages,
        SUM(CASE WHEN i.index_id IN (0, 1) THEN ps.used_page_count ELSE 0 END) AS data_pages,
        SUM(CASE WHEN i.index_id > 1 THEN ps.used_page_count ELSE 0 END) AS index_pages,
        SUM(ps.reserved_page_count) AS reserved_pages
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    INNER JOIN sys.indexes i ON i.object_id = t.object_id
    INNER JOIN sys.dm_db_partition_stats ps
        ON ps.object_id = t.object_id AND ps.index_id = i.index_id
    WHERE t.is_ms_shipped = 0
    GROUP BY s.name, t.name
),
db_used AS (
    SELECT SUM(used_pages) AS total_used_pages FROM table_pages
)
SELECT
    tp.schema_name,
    tp.table_name,
    tp.row_count,
    CAST(tp.data_pages * 8.0 / 1024 AS decimal(18, 2)) AS data_mb,
    CAST(tp.index_pages * 8.0 / 1024 AS decimal(18, 2)) AS index_mb,
    CAST(tp.used_pages * 8.0 / 1024 AS decimal(18, 2)) AS used_mb,
    CAST(tp.reserved_pages * 8.0 / 1024 AS decimal(18, 2)) AS reserved_mb,
    CAST(100.0 * tp.used_pages / NULLIF(du.total_used_pages, 0) AS decimal(5, 2)) AS pct_db_used
FROM table_pages tp
CROSS JOIN db_used du
ORDER BY tp.used_pages DESC;

/* ============================================================================
   3. HEAVY MAX / BLOB / XML COLUMNS
   ============================================================================ */

SELECT
    c.TABLE_SCHEMA,
    c.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    CASE
        WHEN c.CHARACTER_MAXIMUM_LENGTH = -1 THEN 'MAX'
        ELSE CAST(c.CHARACTER_MAXIMUM_LENGTH AS varchar(20))
    END AS max_length
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.DATA_TYPE IN ('nvarchar', 'varchar', 'varbinary', 'xml', 'text', 'ntext', 'image')
  AND (
        c.CHARACTER_MAXIMUM_LENGTH = -1
        OR c.DATA_TYPE IN ('xml', 'text', 'ntext', 'image')
      )
ORDER BY c.TABLE_NAME, c.COLUMN_NAME;

/* ============================================================================
   4. DATE / DATETIME COLUMNS (for retention cutoff selection)
   ============================================================================ */

SELECT
    c.TABLE_SCHEMA,
    c.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    CASE
        WHEN c.COLUMN_NAME LIKE '%created%' THEN 'created_at_semantic'
        WHEN c.COLUMN_NAME LIKE '%updated%' THEN 'updated_at_semantic'
        WHEN c.COLUMN_NAME LIKE '%expires%' THEN 'expires_at_semantic'
        WHEN c.COLUMN_NAME LIKE '%started%' THEN 'started_at_semantic'
        WHEN c.COLUMN_NAME LIKE '%finished%' OR c.COLUMN_NAME LIKE '%completed%' THEN 'finished_semantic'
        WHEN c.COLUMN_NAME LIKE '%processed%' THEN 'processed_at_semantic'
        WHEN c.COLUMN_NAME LIKE '%received%' OR c.COLUMN_NAME LIKE '%sent%' OR c.COLUMN_NAME LIKE '%delivered%' THEN 'event_time_semantic'
        WHEN c.COLUMN_NAME LIKE '%last_activity%' OR c.COLUMN_NAME LIKE '%last_attempt%' THEN 'activity_semantic'
        ELSE 'review_manually'
    END AS suggested_retention_semantic
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.DATA_TYPE IN ('date', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime')
  AND c.TABLE_SCHEMA = 'dbo'
ORDER BY c.TABLE_NAME, c.COLUMN_NAME;

/* ============================================================================
   5. FOREIGN KEYS — WhatsApp / bot / observability dependency graph
   ============================================================================ */

SELECT
    OBJECT_SCHEMA_NAME(fk.parent_object_id) AS child_schema,
    OBJECT_NAME(fk.parent_object_id) AS child_table,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS child_column,
    OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parent_schema,
    OBJECT_NAME(fk.referenced_object_id) AS parent_table,
    COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS parent_column,
    fk.delete_referential_action_desc AS on_delete
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
WHERE OBJECT_NAME(fk.parent_object_id) LIKE 'whatsapp%'
   OR OBJECT_NAME(fk.parent_object_id) = 'bot_sessions'
   OR OBJECT_NAME(fk.referenced_object_id) LIKE 'whatsapp%'
   OR OBJECT_NAME(fk.referenced_object_id) = 'bot_sessions'
ORDER BY child_table, child_column;

/* ============================================================================
   6. INDEX SIZES — tables most likely to grow
   ============================================================================ */

SELECT
    t.name AS table_name,
    i.name AS index_name,
    i.type_desc,
    i.is_unique,
    CAST(SUM(ps.used_page_count) * 8.0 / 1024 AS decimal(18, 2)) AS index_mb
FROM sys.indexes i
INNER JOIN sys.tables t ON t.object_id = i.object_id
INNER JOIN sys.dm_db_partition_stats ps
    ON ps.object_id = i.object_id AND ps.index_id = i.index_id
WHERE t.name IN (
    'audit_logs',
    'whatsapp_messages',
    'whatsapp_webhook_events',
    'whatsapp_provider_events',
    'whatsapp_conversations',
    'whatsapp_flow_executions',
    'whatsapp_flow_steps',
    'whatsapp_flow_candidates',
    'bot_sessions',
    'bot_simulation_sessions',
    'whatsapp_attendance_notifications',
    'whatsapp_admin_alert_notifications',
    'whatsapp_admin_alert_notification_send_attempts',
    'whatsapp_operation_assignment_notifications',
    'whatsapp_operation_assignment_notification_send_attempts',
    'whatsapp_payroll_receipt_notifications',
    'whatsapp_payroll_receipt_notification_send_attempts',
    'import_jobs',
    'company_lifecycle_events',
    'employee_workdays',
    'operation_workdays',
    'attendance_records'
)
GROUP BY t.name, i.name, i.type_desc, i.is_unique
ORDER BY index_mb DESC;

/* ============================================================================
   7. AGE DISTRIBUTION — retention candidates
   Cutoffs relative to SYSUTCDATETIME() (UTC)
   ============================================================================ */

DECLARE @cut30 datetime2 = DATEADD(DAY, -30, SYSUTCDATETIME());
DECLARE @cut60 datetime2 = DATEADD(DAY, -60, SYSUTCDATETIME());
DECLARE @cut90 datetime2 = DATEADD(DAY, -90, SYSUTCDATETIME());
DECLARE @cut180 datetime2 = DATEADD(DAY, -180, SYSUTCDATETIME());
DECLARE @cut365 datetime2 = DATEADD(DAY, -365, SYSUTCDATETIME());

-- audit_logs — retention column: created_at
SELECT
    'audit_logs' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN created_at < @cut60 THEN 1 ELSE 0 END) AS ge_60d,
    SUM(CASE WHEN created_at < @cut90 THEN 1 ELSE 0 END) AS ge_90d,
    SUM(CASE WHEN created_at < @cut180 THEN 1 ELSE 0 END) AS ge_180d,
    SUM(CASE WHEN created_at < @cut365 THEN 1 ELSE 0 END) AS ge_365d
FROM audit_logs;

-- bot_sessions — retention column: expires_at (session end) + created_at fallback
SELECT
    'bot_sessions' AS table_name,
    'expires_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN expires_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN expires_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN expires_at < @cut60 THEN 1 ELSE 0 END) AS ge_60d,
    SUM(CASE WHEN expires_at < @cut90 THEN 1 ELSE 0 END) AS ge_90d,
    SUM(CASE WHEN state IN (
        N'WAITING_LOCATION', N'WAITING_INVENTORY_SELECTION',
        N'WAITING_CHECKOUT_LOCATION', N'WAITING_CHECKOUT_CONFIRMATION',
        N'WAITING_ABSENCE_TYPE', N'WAITING_ABSENCE_DATES'
    ) AND expires_at > SYSUTCDATETIME() THEN 1 ELSE 0 END) AS active_not_expired
FROM bot_sessions;

-- whatsapp_messages — retention column: created_at
SELECT
    'whatsapp_messages' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN created_at < @cut60 THEN 1 ELSE 0 END) AS ge_60d,
    SUM(CASE WHEN created_at < @cut90 THEN 1 ELSE 0 END) AS ge_90d
FROM whatsapp_messages;

-- whatsapp_webhook_events — retention column: created_at (received); guard pending
SELECT
    'whatsapp_webhook_events' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN created_at < @cut90 THEN 1 ELSE 0 END) AS ge_90d,
    SUM(CASE WHEN processing_status IN (N'RECEIVED', N'PROCESSING') THEN 1 ELSE 0 END) AS pending_processing,
    SUM(CASE WHEN processing_status = N'FAILED' AND (next_attempt_at IS NULL OR next_attempt_at <= SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS failed_retryable
FROM whatsapp_webhook_events;

-- whatsapp_conversations — retention column: last_activity_at
SELECT
    'whatsapp_conversations' AS table_name,
    'last_activity_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN last_activity_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN last_activity_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN status = N'ACTIVE' THEN 1 ELSE 0 END) AS status_active
FROM whatsapp_conversations;

-- whatsapp_flow_executions — retention column: started_at (existing cleanup uses this)
SELECT
    'whatsapp_flow_executions' AS table_name,
    'started_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN started_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN started_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN started_at < @cut90 THEN 1 ELSE 0 END) AS ge_90d,
    SUM(CASE WHEN status = N'STARTED' THEN 1 ELSE 0 END) AS status_started
FROM whatsapp_flow_executions;

-- whatsapp_provider_events — retention column: received_at (existing cleanup uses this)
SELECT
    'whatsapp_provider_events' AS table_name,
    'received_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN received_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN received_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN received_at < @cut90 THEN 1 ELSE 0 END) AS ge_90d
FROM whatsapp_provider_events;

-- whatsapp_attendance_notifications — retention column: created_at; guard pending
SELECT
    'whatsapp_attendance_notifications' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at >= @cut30 THEN 1 ELSE 0 END) AS lt_30d,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN status IN (N'PENDING', N'PROCESSING', N'RETRYING', N'PREPARED') THEN 1 ELSE 0 END) AS pending_status
FROM whatsapp_attendance_notifications;

-- Notification outboxes (terminal rows only for future purge design)
SELECT
    'whatsapp_admin_alert_notifications' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN status IN (N'PENDING', N'PROCESSING', N'RETRYING') THEN 1 ELSE 0 END) AS pending_status
FROM whatsapp_admin_alert_notifications;

SELECT
    'whatsapp_operation_assignment_notifications' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN status IN (N'PENDING', N'PROCESSING', N'RETRYING') THEN 1 ELSE 0 END) AS pending_status
FROM whatsapp_operation_assignment_notifications;

SELECT
    'whatsapp_payroll_receipt_notifications' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d,
    SUM(CASE WHEN status IN (N'PENDING', N'PROCESSING', N'RETRYING') THEN 1 ELSE 0 END) AS pending_status
FROM whatsapp_payroll_receipt_notifications;

-- bot_simulation_sessions — dev/test tool
SELECT
    'bot_simulation_sessions' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at < @cut30 THEN 1 ELSE 0 END) AS ge_30d
FROM bot_simulation_sessions;

-- import_jobs — derived import artifacts
SELECT
    'import_jobs' AS table_name,
    'created_at' AS retention_column,
    COUNT(*) AS total,
    SUM(CASE WHEN created_at < @cut90 THEN 1 ELSE 0 END) AS ge_90d,
    SUM(CASE WHEN status IN (N'PENDING', N'PROCESSING') THEN 1 ELSE 0 END) AS pending_status
FROM import_jobs;

/* ============================================================================
   8. MONTHLY GROWTH — primary candidates
   ============================================================================ */

SELECT 'audit_logs' AS table_name, FORMAT(created_at, 'yyyy-MM') AS year_month, COUNT(*) AS row_count
FROM audit_logs
GROUP BY FORMAT(created_at, 'yyyy-MM')
ORDER BY year_month;

SELECT 'whatsapp_messages' AS table_name, FORMAT(created_at, 'yyyy-MM') AS year_month, COUNT(*) AS row_count
FROM whatsapp_messages
GROUP BY FORMAT(created_at, 'yyyy-MM')
ORDER BY year_month;

SELECT 'whatsapp_webhook_events' AS table_name, FORMAT(created_at, 'yyyy-MM') AS year_month, COUNT(*) AS row_count
FROM whatsapp_webhook_events
GROUP BY FORMAT(created_at, 'yyyy-MM')
ORDER BY year_month;

SELECT 'whatsapp_provider_events' AS table_name, FORMAT(received_at, 'yyyy-MM') AS year_month, COUNT(*) AS row_count
FROM whatsapp_provider_events
GROUP BY FORMAT(received_at, 'yyyy-MM')
ORDER BY year_month;

SELECT 'bot_sessions' AS table_name, FORMAT(created_at, 'yyyy-MM') AS year_month, COUNT(*) AS row_count
FROM bot_sessions
GROUP BY FORMAT(created_at, 'yyyy-MM')
ORDER BY year_month;

SELECT 'whatsapp_flow_executions' AS table_name, FORMAT(started_at, 'yyyy-MM') AS year_month, COUNT(*) AS row_count
FROM whatsapp_flow_executions
GROUP BY FORMAT(started_at, 'yyyy-MM')
ORDER BY year_month;

/* ============================================================================
   9. PAYLOAD SIZE ESTIMATES
   WARNING: SUM(DATALENGTH(...)) on large tables can be expensive (table scans).
   Run one table at a time in production; consider TABLESAMPLE or TOP sampling first.
   ============================================================================ */

-- audit_logs JSON snapshots
SELECT
    'audit_logs' AS table_name,
    COUNT(*) AS rows,
    AVG(CAST(DATALENGTH(COALESCE(previous_data, N'')) + DATALENGTH(COALESCE(new_data, N'')) AS float)) AS avg_payload_bytes,
    MAX(CAST(DATALENGTH(COALESCE(previous_data, N'')) + DATALENGTH(COALESCE(new_data, N'')) AS bigint)) AS max_payload_bytes,
    SUM(CAST(DATALENGTH(COALESCE(previous_data, N'')) + DATALENGTH(COALESCE(new_data, N'')) AS bigint)) / 1024.0 / 1024.0 AS total_payload_mb
FROM audit_logs;

-- whatsapp_messages body + raw_payload
SELECT
    'whatsapp_messages' AS table_name,
    COUNT(*) AS rows,
    AVG(CAST(DATALENGTH(COALESCE(body, N'')) + DATALENGTH(COALESCE(raw_payload, N'')) AS float)) AS avg_payload_bytes,
    MAX(CAST(DATALENGTH(COALESCE(body, N'')) + DATALENGTH(COALESCE(raw_payload, N'')) AS bigint)) AS max_payload_bytes,
    SUM(CAST(DATALENGTH(COALESCE(body, N'')) + DATALENGTH(COALESCE(raw_payload, N'')) AS bigint)) / 1024.0 / 1024.0 AS total_payload_mb
FROM whatsapp_messages;

-- whatsapp_webhook_events response_body (TwiML replay)
SELECT
    'whatsapp_webhook_events' AS table_name,
    COUNT(*) AS rows,
    AVG(CAST(DATALENGTH(COALESCE(response_body, N'')) AS float)) AS avg_payload_bytes,
    MAX(CAST(DATALENGTH(COALESCE(response_body, N'')) AS bigint)) AS max_payload_bytes,
    SUM(CAST(DATALENGTH(COALESCE(response_body, N'')) AS bigint)) / 1024.0 / 1024.0 AS total_payload_mb
FROM whatsapp_webhook_events;

-- whatsapp_provider_events sanitized payload
SELECT
    'whatsapp_provider_events' AS table_name,
    COUNT(*) AS rows,
    AVG(CAST(DATALENGTH(COALESCE(payload_json_sanitized, N'')) AS float)) AS avg_payload_bytes,
    MAX(CAST(DATALENGTH(COALESCE(payload_json_sanitized, N'')) AS bigint)) AS max_payload_bytes,
    SUM(CAST(DATALENGTH(COALESCE(payload_json_sanitized, N'')) AS bigint)) / 1024.0 / 1024.0 AS total_payload_mb
FROM whatsapp_provider_events;

-- bot_sessions context_json
SELECT
    'bot_sessions' AS table_name,
    COUNT(*) AS rows,
    AVG(CAST(DATALENGTH(COALESCE(context_json, N'')) AS float)) AS avg_payload_bytes,
    MAX(CAST(DATALENGTH(COALESCE(context_json, N'')) AS bigint)) AS max_payload_bytes
FROM bot_sessions;

/* ============================================================================
   10. PURGE CANDIDATE SUMMARY (row counts + estimated weight)
   Weight estimate formula when exact payload sum is skipped:
     estimated_mb = (table_used_mb / NULLIF(row_count,0)) * eligible_rows
   Join with section 2 output manually or via temp table in your session.
   ============================================================================ */

;WITH age AS (
    SELECT 'whatsapp_messages' AS table_name, COUNT(*) AS total,
        SUM(CASE WHEN created_at < DATEADD(DAY,-30,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS ge_30d,
        SUM(CASE WHEN created_at < DATEADD(DAY,-60,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS ge_60d,
        SUM(CASE WHEN created_at < DATEADD(DAY,-90,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS ge_90d
    FROM whatsapp_messages
    UNION ALL
    SELECT 'whatsapp_webhook_events', COUNT(*),
        SUM(CASE WHEN created_at < DATEADD(DAY,-30,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN created_at < DATEADD(DAY,-60,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN created_at < DATEADD(DAY,-90,SYSUTCDATETIME()) THEN 1 ELSE 0 END)
    FROM whatsapp_webhook_events
    UNION ALL
    SELECT 'whatsapp_provider_events', COUNT(*),
        SUM(CASE WHEN received_at < DATEADD(DAY,-30,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN received_at < DATEADD(DAY,-60,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN received_at < DATEADD(DAY,-90,SYSUTCDATETIME()) THEN 1 ELSE 0 END)
    FROM whatsapp_provider_events
    UNION ALL
    SELECT 'bot_sessions', COUNT(*),
        SUM(CASE WHEN expires_at < DATEADD(DAY,-30,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN expires_at < DATEADD(DAY,-60,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN expires_at < DATEADD(DAY,-90,SYSUTCDATETIME()) THEN 1 ELSE 0 END)
    FROM bot_sessions
    UNION ALL
    SELECT 'whatsapp_flow_executions', COUNT(*),
        SUM(CASE WHEN started_at < DATEADD(DAY,-30,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN started_at < DATEADD(DAY,-60,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN started_at < DATEADD(DAY,-90,SYSUTCDATETIME()) THEN 1 ELSE 0 END)
    FROM whatsapp_flow_executions
    UNION ALL
    SELECT 'audit_logs', COUNT(*),
        SUM(CASE WHEN created_at < DATEADD(DAY,-30,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN created_at < DATEADD(DAY,-60,SYSUTCDATETIME()) THEN 1 ELSE 0 END),
        SUM(CASE WHEN created_at < DATEADD(DAY,-90,SYSUTCDATETIME()) THEN 1 ELSE 0 END)
    FROM audit_logs
),
sizes AS (
    SELECT
        t.name AS table_name,
        SUM(ps.row_count) AS row_count,
        SUM(ps.used_page_count) * 8.0 / 1024 AS used_mb
    FROM sys.tables t
    INNER JOIN sys.dm_db_partition_stats ps ON ps.object_id = t.object_id AND ps.index_id IN (0, 1)
    GROUP BY t.name
)
SELECT
    a.table_name,
    a.total,
    a.ge_30d,
    a.ge_60d,
    a.ge_90d,
    CAST(s.used_mb AS decimal(18, 2)) AS total_used_mb,
    CAST(s.used_mb * 1.0 * a.ge_30d / NULLIF(s.row_count, 0) AS decimal(18, 2)) AS est_used_mb_ge_30d,
    CAST(s.used_mb * 1.0 * a.ge_60d / NULLIF(s.row_count, 0) AS decimal(18, 2)) AS est_used_mb_ge_60d,
    CAST(s.used_mb * 1.0 * a.ge_90d / NULLIF(s.row_count, 0) AS decimal(18, 2)) AS est_used_mb_ge_90d,
    'ESTIMATED' AS weight_confidence
FROM age a
LEFT JOIN sizes s ON s.table_name = a.table_name
ORDER BY est_used_mb_ge_30d DESC;

/* ============================================================================
   11. ACTIVE / PENDING GUARDS — records that must NOT be purged by age alone
   ============================================================================ */

-- Active bot sessions (physical attendance / absence flows)
SELECT COUNT(*) AS active_bot_sessions
FROM bot_sessions
WHERE expires_at > SYSUTCDATETIME()
  AND state NOT IN (N'COMPLETED', N'CANCELLED', N'EXPIRED');

-- Webhook events in-flight or awaiting retry
SELECT processing_status, COUNT(*) AS cnt
FROM whatsapp_webhook_events
GROUP BY processing_status
ORDER BY cnt DESC;

-- Notification outboxes not in terminal state
SELECT 'whatsapp_attendance_notifications' AS tbl, status, COUNT(*) AS cnt
FROM whatsapp_attendance_notifications
GROUP BY status
UNION ALL
SELECT 'whatsapp_admin_alert_notifications', status, COUNT(*)
FROM whatsapp_admin_alert_notifications
GROUP BY status
UNION ALL
SELECT 'whatsapp_operation_assignment_notifications', status, COUNT(*)
FROM whatsapp_operation_assignment_notifications
GROUP BY status
UNION ALL
SELECT 'whatsapp_payroll_receipt_notifications', status, COUNT(*)
FROM whatsapp_payroll_receipt_notifications
GROUP BY status
ORDER BY tbl, cnt DESC;

-- Companies mid-deletion
SELECT COUNT(*) AS companies_deleting
FROM companies
WHERE lifecycle_status = N'DELETING';

GO
