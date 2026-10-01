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
  local sql_rc=0
  started_epoch="$(date -u +%s)"

  local name_paths
  name_paths="$(mssql_backup_filenames "${KIND}")"
  filename="$(printf '%s\n' "${name_paths}" | sed -n '1p')"
  container_path="$(printf '%s\n' "${name_paths}" | sed -n '2p')"

  mssql_backup_log INFO "start kind=${KIND} database=${MSSQL_BACKUP_DATABASE} file=${filename}"

  if [[ "${KIND}" == "FULL" ]]; then
    # Bootstrap: ensure FULL recovery, then take a new FULL (starts the log chain).
    mssql_backup_ensure_full_recovery
    mssql_backup_sqlcmd "
BACKUP DATABASE [${MSSQL_BACKUP_DATABASE}]
TO DISK = N'${container_path}'
WITH INIT, CHECKSUM, STATS = 10;
"
  else
    # LOG never changes recovery model. Chain validity is enforced by SQL Server.
    local recovery_model
    recovery_model="$(mssql_backup_get_recovery_model)"
    MSSQL_BACKUP_RECOVERY_BEFORE="${recovery_model}"
    MSSQL_BACKUP_RECOVERY_TRANSITION="UNCHANGED"
    export MSSQL_BACKUP_RECOVERY_BEFORE
    export MSSQL_BACKUP_RECOVERY_TRANSITION
    mssql_backup_assert_log_recovery_full "${recovery_model}"

    set +e
    mssql_backup_sqlcmd "
BACKUP LOG [${MSSQL_BACKUP_DATABASE}]
TO DISK = N'${container_path}'
WITH INIT, CHECKSUM, STATS = 10;
"
    sql_rc=$?
    set -e
    if [[ "${sql_rc}" -ne 0 ]]; then
      mssql_backup_log ERROR \
        "BACKUP LOG failed (sqlcmd exit=${sql_rc}). Original SQL error is above. If no initial FULL exists after a recovery-model bootstrap, run: ${SCRIPT_DIR}/run-backup.sh FULL"
      exit "${sql_rc}"
    fi
  fi

  finished_epoch="$(date -u +%s)"
  duration_s=$((finished_epoch - started_epoch))
  mssql_backup_log INFO "success kind=${KIND} file=${filename} durationSec=${duration_s} recoveryTransition=${MSSQL_BACKUP_RECOVERY_TRANSITION}"
}

mssql_backup_with_lock "${MSSQL_BACKUP_LOCK_FILE}" run_backup
