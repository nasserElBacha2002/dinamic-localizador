#!/usr/bin/env bash
# READ-ONLY post-deploy verification of recovery model / backup chain / log health.
# Does not take backups, shrink, restore, or alter configuration.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

mssql_backup_load_env
mssql_backup_require_password

DB="${MSSQL_BACKUP_DATABASE}"

mssql_backup_log INFO "read-only recovery verification for database=${DB}"

mssql_backup_sqlcmd "
SET NOCOUNT ON;

SELECT 'recovery_model' AS metric, recovery_model_desc AS value
FROM sys.databases WHERE name = N'${DB}';

SELECT 'log_reuse_wait_desc' AS metric, log_reuse_wait_desc AS value
FROM sys.databases WHERE name = N'${DB}';

SELECT
  'log_size_mb' AS metric,
  CAST(total_log_size_mb AS varchar(32)) AS value
FROM sys.dm_db_log_stats(DB_ID(N'${DB}'));

SELECT
  'log_used_mb' AS metric,
  CAST(active_log_size_mb AS varchar(32)) AS value
FROM sys.dm_db_log_stats(DB_ID(N'${DB}'));

SELECT
  'log_since_last_log_backup_mb' AS metric,
  CAST(log_since_last_log_backup_mb AS varchar(32)) AS value
FROM sys.dm_db_log_stats(DB_ID(N'${DB}'));

SELECT
  'active_vlf_count' AS metric,
  CAST(COUNT(*) AS varchar(32)) AS value
FROM sys.dm_db_log_info(DB_ID(N'${DB}'))
WHERE vlf_active = 1;

SELECT TOP 1
  'last_full_backup_utc' AS metric,
  CONVERT(varchar(33), backup_finish_date, 127) AS value
FROM msdb.dbo.backupset
WHERE database_name = N'${DB}' AND type = 'D' AND is_copy_only = 0
ORDER BY backup_finish_date DESC;

SELECT TOP 1
  'last_log_backup_utc' AS metric,
  CONVERT(varchar(33), backup_finish_date, 127) AS value
FROM msdb.dbo.backupset
WHERE database_name = N'${DB}' AND type = 'L'
ORDER BY backup_finish_date DESC;

SELECT
  'full_backup_count' AS metric,
  CAST(COUNT(*) AS varchar(32)) AS value
FROM msdb.dbo.backupset
WHERE database_name = N'${DB}' AND type = 'D' AND is_copy_only = 0;

SELECT
  'log_backup_count' AS metric,
  CAST(COUNT(*) AS varchar(32)) AS value
FROM msdb.dbo.backupset
WHERE database_name = N'${DB}' AND type = 'L';

-- Differential-base metadata only (NOT authoritative for LOG eligibility).
SELECT
  'differential_base_lsn_present' AS metric,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM sys.master_files
      WHERE database_id = DB_ID(N'${DB}')
        AND type = 0
        AND differential_base_lsn IS NOT NULL
    ) THEN '1' ELSE '0'
  END AS value;
"

mssql_backup_log INFO "read-only verification finished (no changes made)"
