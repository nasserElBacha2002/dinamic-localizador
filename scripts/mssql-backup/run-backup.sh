#!/usr/bin/env bash
# Run a FULL or LOG backup for dinamic_attendance (host-side).
# Usage: run-backup.sh FULL|LOG
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

KIND="${1:-}"
if [[ "${KIND}" != "FULL" && "${KIND}" != "LOG" ]]; then
  echo "Usage: $0 FULL|LOG" >&2
  exit 1
fi

mssql_backup_load_env
mssql_backup_require_enabled
mssql_backup_require_password
mkdir -p "${MSSQL_BACKUP_HOST_PATH}"

run_backup() {
  local started_epoch finished_epoch duration_s
  local filename container_path
  started_epoch="$(date -u +%s)"

  local name_paths
  name_paths="$(mssql_backup_filenames "${KIND}")"
  filename="$(printf '%s\n' "${name_paths}" | sed -n '1p')"
  container_path="$(printf '%s\n' "${name_paths}" | sed -n '2p')"

  mssql_backup_log INFO "start kind=${KIND} database=${MSSQL_BACKUP_DATABASE} file=${filename}"

  mssql_backup_ensure_full_recovery

  if [[ "${KIND}" == "LOG" ]]; then
    if ! mssql_backup_has_full_chain; then
      mssql_backup_log ERROR "no valid FULL backup chain found; refusing LOG backup"
      exit 4
    fi
  fi

  if [[ "${KIND}" == "FULL" ]]; then
    mssql_backup_sqlcmd "
BACKUP DATABASE [${MSSQL_BACKUP_DATABASE}]
TO DISK = N'${container_path}'
WITH INIT, CHECKSUM, STATS = 10;
"
  else
    mssql_backup_sqlcmd "
BACKUP LOG [${MSSQL_BACKUP_DATABASE}]
TO DISK = N'${container_path}'
WITH INIT, CHECKSUM, STATS = 10;
"
  fi

  finished_epoch="$(date -u +%s)"
  duration_s=$((finished_epoch - started_epoch))
  mssql_backup_log INFO "success kind=${KIND} file=${filename} durationSec=${duration_s}"
}

mssql_backup_with_lock "${MSSQL_BACKUP_LOCK_FILE}" run_backup
