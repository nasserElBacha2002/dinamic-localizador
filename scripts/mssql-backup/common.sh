#!/usr/bin/env bash
# Shared helpers for Dinamic Attendance MSSQL FULL / LOG backups.
# Runs on the Docker host (cron/systemd), not inside the Node app process.
set -euo pipefail

MSSQL_BACKUP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mssql_backup_log() {
  local level="$1"
  shift
  printf '%s [%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "${level}" "$*" >&2
}

mssql_backup_load_env() {
  local env_file="${MSSQL_BACKUP_ENV_FILE:-}"
  if [[ -z "${env_file}" ]]; then
    env_file="$(cd "${MSSQL_BACKUP_LIB_DIR}/../.." && pwd)/.env"
  fi

  if [[ -f "${env_file}" ]]; then
    eval "$(
      python3 - "${env_file}" <<'PY'
import shlex, sys
from pathlib import Path
wanted = {
    "MSSQL_BACKUP_ENABLED",
    "MSSQL_BACKUP_DATABASE",
    "MSSQL_BACKUP_HOST_PATH",
    "MSSQL_BACKUP_CONTAINER_PATH",
    "MSSQL_BACKUP_CONTAINER_NAME",
    "MSSQL_BACKUP_RETENTION_DAYS",
    "MSSQL_BACKUP_LOCK_FILE",
    "MSSQL_BACKUP_FULL_HOUR_UTC",
    "MSSQL_BACKUP_CRON_LOG_DIR",
    "MSSQL_BACKUP_CRON_USER",
    "DB_NAME",
    "DB_PASSWORD",
    "DB_USER",
}
path = Path(sys.argv[1])
for raw in path.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    key = key.strip()
    if key not in wanted:
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1]
    print(f"export {key}={shlex.quote(value)}")
PY
    )"
  fi

  export MSSQL_BACKUP_ENABLED="${MSSQL_BACKUP_ENABLED:-true}"
  export MSSQL_BACKUP_DATABASE="${MSSQL_BACKUP_DATABASE:-${DB_NAME:-dinamic_attendance}}"
  export MSSQL_BACKUP_HOST_PATH="${MSSQL_BACKUP_HOST_PATH:-./backups/mssql}"
  export MSSQL_BACKUP_CONTAINER_PATH="${MSSQL_BACKUP_CONTAINER_PATH:-/var/opt/mssql/backup}"
  export MSSQL_BACKUP_CONTAINER_NAME="${MSSQL_BACKUP_CONTAINER_NAME:-dinamic-attendance-sqlserver}"
  export MSSQL_BACKUP_RETENTION_DAYS="${MSSQL_BACKUP_RETENTION_DAYS:-14}"
  export DB_USER="${DB_USER:-sa}"

  # Resolve relative host path against repo root.
  if [[ "${MSSQL_BACKUP_HOST_PATH}" != /* ]]; then
    local repo_root
    repo_root="$(cd "${MSSQL_BACKUP_LIB_DIR}/../.." && pwd)"
    export MSSQL_BACKUP_HOST_PATH="${repo_root}/${MSSQL_BACKUP_HOST_PATH#./}"
  fi
  export MSSQL_BACKUP_LOCK_FILE="${MSSQL_BACKUP_LOCK_FILE:-${MSSQL_BACKUP_HOST_PATH}/.dinamic-mssql-backup.lock}"
}

mssql_backup_require_enabled() {
  case "${MSSQL_BACKUP_ENABLED}" in
    true|TRUE|1|yes|YES) ;;
    *)
      mssql_backup_log INFO "backups disabled (MSSQL_BACKUP_ENABLED=${MSSQL_BACKUP_ENABLED})"
      exit 0
      ;;
  esac
}

mssql_backup_require_password() {
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    mssql_backup_log ERROR "DB_PASSWORD is required to run sqlcmd inside the SQL Server container"
    exit 2
  fi
}

mssql_backup_sqlcmd() {
  local query="$1"
  docker exec \
    "${MSSQL_BACKUP_CONTAINER_NAME}" \
    /opt/mssql-tools18/bin/sqlcmd \
      -S localhost \
      -U "${DB_USER}" \
      -P "${DB_PASSWORD}" \
      -C \
      -b \
      -V 16 \
      -Q "${query}"
}

mssql_backup_with_lock() {
  local lock_file="$1"
  shift
  mkdir -p "$(dirname "${lock_file}")"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"${lock_file}"
    if ! flock -n 9; then
      mssql_backup_log WARN "another backup process holds the lock; skipping"
      exit 0
    fi
    "$@"
    return $?
  fi

  local lock_dir="${lock_file}.d"
  if ! mkdir "${lock_dir}" 2>/dev/null; then
    mssql_backup_log WARN "another backup process holds the lock; skipping"
    exit 0
  fi
  trap 'rmdir "${lock_dir}" 2>/dev/null || true' EXIT
  "$@"
}

mssql_backup_filenames() {
  local kind="$1"
  python3 - "${MSSQL_BACKUP_LIB_DIR}" "${MSSQL_BACKUP_DATABASE}" "${kind}" "${MSSQL_BACKUP_CONTAINER_PATH}" <<'PY'
import sys
from datetime import datetime, timezone
sys.path.insert(0, sys.argv[1])
from paths import build_backup_filename, container_backup_path
kind = sys.argv[3]
db = sys.argv[2]
name = build_backup_filename(db, kind, datetime.now(timezone.utc))
container = container_backup_path(sys.argv[4], name)
print(name)
print(container)
PY
}

mssql_backup_ensure_full_recovery() {
  # Sets MSSQL_BACKUP_RECOVERY_BEFORE and MSSQL_BACKUP_RECOVERY_TRANSITION (CHANGED|UNCHANGED).
  local db="${MSSQL_BACKUP_DATABASE}"
  local current
  current="$(
    mssql_backup_sqlcmd "SET NOCOUNT ON; SELECT recovery_model_desc FROM sys.databases WHERE name = N'${db}';" \
      | tr -d '\r' \
      | awk 'NF && $1 !~ /recovery_model_desc/ { print $1; exit }'
  )"
  if [[ -z "${current}" ]]; then
    mssql_backup_log ERROR "database ${db} not found"
    exit 3
  fi
  MSSQL_BACKUP_RECOVERY_BEFORE="${current}"
  if [[ "${current}" != "FULL" ]]; then
    mssql_backup_log WARN "recovery model is ${current}; setting FULL"
    mssql_backup_sqlcmd "ALTER DATABASE [${db}] SET RECOVERY FULL;"
    MSSQL_BACKUP_RECOVERY_TRANSITION="CHANGED"
  else
    mssql_backup_log INFO "recovery model already FULL"
    MSSQL_BACKUP_RECOVERY_TRANSITION="UNCHANGED"
  fi
  export MSSQL_BACKUP_RECOVERY_BEFORE
  export MSSQL_BACKUP_RECOVERY_TRANSITION
}

mssql_backup_has_full_chain() {
  local db="${MSSQL_BACKUP_DATABASE}"
  local count
  count="$(
    mssql_backup_sqlcmd "
SET NOCOUNT ON;
SELECT COUNT(*) AS cnt
FROM msdb.dbo.backupset
WHERE database_name = N'${db}'
  AND type = 'D'
  AND is_copy_only = 0;
" | tr -d '\r' | awk 'NF && $1 !~ /cnt/ { print $1; exit }'
  )"
  [[ "${count}" =~ ^[1-9][0-9]*$ ]]
}

mssql_backup_assert_log_allowed() {
  local recovery_before="$1"
  local recovery_after="$2"
  local has_full="false"
  if mssql_backup_has_full_chain; then
    has_full="true"
  fi
  local decision
  decision="$(
    python3 - "${MSSQL_BACKUP_LIB_DIR}" "${recovery_before}" "${recovery_after}" "${has_full}" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from paths import can_run_log_backup
ok, reason = can_run_log_backup(
    recovery_before=sys.argv[2],
    recovery_after=sys.argv[3],
    has_full_backup_row=(sys.argv[4].lower() == "true"),
)
print("OK" if ok else "DENY")
print(reason)
PY
  )"
  local status reason
  status="$(printf '%s\n' "${decision}" | sed -n '1p')"
  reason="$(printf '%s\n' "${decision}" | sed -n '2p')"
  if [[ "${status}" != "OK" ]]; then
    mssql_backup_log ERROR "${reason}"
    exit 5
  fi
}
