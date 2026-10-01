#!/usr/bin/env bash
# Idempotent Ubuntu host cron installer for Dinamic MSSQL FULL/LOG backups.
#
# Installs (UTC):
#   LOG:  */15 * * * *   → run-backup.sh LOG
#   FULL: 0 <hour> * * * → run-scheduled.sh FULL (FULL + retention cleanup)
#
# Usage (from repo root or any cwd):
#   sudo bash scripts/mssql-backup/install-cron.sh
#   bash scripts/mssql-backup/install-cron.sh --user "$USER"
#   bash scripts/mssql-backup/install-cron.sh --uninstall
#
# Consumed config (root .env or environment):
#   MSSQL_BACKUP_ENABLED (default true)
#   MSSQL_BACKUP_FULL_HOUR_UTC (0-23, default 3)
#   MSSQL_BACKUP_CRON_LOG_DIR (default <host backup path>/logs)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

MARKER_LOG="# dinamic-mssql-backup-log"
MARKER_FULL="# dinamic-mssql-backup-full"
UNINSTALL=0
CRON_USER="${MSSQL_BACKUP_CRON_USER:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall) UNINSTALL=1; shift ;;
    --user) CRON_USER="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mssql_backup_load_env

FULL_HOUR="${MSSQL_BACKUP_FULL_HOUR_UTC:-3}"
if ! [[ "${FULL_HOUR}" =~ ^([0-9]|1[0-9]|2[0-3])$ ]]; then
  mssql_backup_log ERROR "MSSQL_BACKUP_FULL_HOUR_UTC must be 0-23 (got ${FULL_HOUR})"
  exit 1
fi

LOG_DIR="${MSSQL_BACKUP_CRON_LOG_DIR:-${MSSQL_BACKUP_HOST_PATH}/logs}"
mkdir -p "${LOG_DIR}"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOG_CMD="cd ${REPO_ROOT} && /bin/bash ${SCRIPT_DIR}/run-backup.sh LOG >> ${LOG_DIR}/log-backup.log 2>&1"
FULL_CMD="cd ${REPO_ROOT} && /bin/bash ${SCRIPT_DIR}/run-scheduled.sh FULL >> ${LOG_DIR}/full-backup.log 2>&1"

LOG_LINE="*/15 * * * * ${LOG_CMD} ${MARKER_LOG}"
FULL_LINE="0 ${FULL_HOUR} * * * ${FULL_CMD} ${MARKER_FULL}"

crontab_list() {
  if [[ -n "${CRON_USER}" ]]; then
    crontab -u "${CRON_USER}" -l 2>/dev/null || true
  else
    crontab -l 2>/dev/null || true
  fi
}

crontab_install() {
  local content="$1"
  if [[ -n "${CRON_USER}" ]]; then
    printf '%s\n' "${content}" | crontab -u "${CRON_USER}" -
  else
    printf '%s\n' "${content}" | crontab -
  fi
}

existing="$(crontab_list)"
filtered="$(
  printf '%s\n' "${existing}" | awk -v m1="${MARKER_LOG}" -v m2="${MARKER_FULL}" '
    index($0, m1) == 0 && index($0, m2) == 0 { print }
  '
)"

if [[ "${UNINSTALL}" -eq 1 ]]; then
  crontab_install "${filtered}"
  mssql_backup_log INFO "removed dinamic MSSQL backup cron entries"
  exit 0
fi

case "${MSSQL_BACKUP_ENABLED}" in
  true|TRUE|1|yes|YES) ;;
  *)
    mssql_backup_log WARN "MSSQL_BACKUP_ENABLED=${MSSQL_BACKUP_ENABLED}; installing disabled marker-only skip — use --uninstall to remove"
    ;;
esac

new_crontab="$(
  printf '%s\n' "${filtered}"
  printf '%s\n' "${LOG_LINE}"
  printf '%s\n' "${FULL_LINE}"
)"
# Drop leading empty line if crontab was empty
new_crontab="$(printf '%s\n' "${new_crontab}" | awk 'NF||printed{printed=1;print}')"

crontab_install "${new_crontab}"
mssql_backup_log INFO "installed cron LOG=*/15 FULL=0 ${FULL_HOUR} * * * (UTC) user=${CRON_USER:-current}"
mssql_backup_log INFO "logs under ${LOG_DIR}"
mssql_backup_log INFO "staging note: after SIMPLE→FULL transition, run FULL once before LOG is allowed"
