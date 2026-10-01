#!/usr/bin/env bash
# Idempotent Ubuntu 22.04 host cron installer for Dinamic MSSQL FULL/LOG backups.
#
# Target: Ubuntu 22.04 user crontab (no CRON_TZ — unreliable on this platform).
# Precondition: host timezone must be UTC (install verifies; does not change it).
#
# Schedules (host UTC clock):
#   LOG:  */15 * * * *   → run-backup.sh LOG
#   FULL: 0 <hour> * * * → run-scheduled.sh FULL (FULL + retention cleanup)
#
# Usage:
#   sudo bash scripts/mssql-backup/install-cron.sh
#   bash scripts/mssql-backup/install-cron.sh --user "$USER"
#   bash scripts/mssql-backup/install-cron.sh --uninstall
#   MSSQL_BACKUP_ENABLED=false bash scripts/mssql-backup/install-cron.sh  # removes managed entries
#
# Consumed config (root .env or environment):
#   MSSQL_BACKUP_ENABLED (default true) — false ⇒ remove managed cron entries
#   MSSQL_BACKUP_FULL_HOUR_UTC (0-23, default 3) — hour on the UTC host clock
#   MSSQL_BACKUP_CRON_LOG_DIR (default <host backup path>/logs)
#   MSSQL_BACKUP_ALLOW_NON_UTC_HOST=true — skip UTC precondition (not for production)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

MARKER_PREAMBLE="# dinamic-mssql-backup-preamble"
MARKER_LOG="# dinamic-mssql-backup-log"
MARKER_FULL="# dinamic-mssql-backup-full"
# Legacy marker from earlier CRON_TZ attempts — still stripped on install/uninstall.
MARKER_TZ_LEGACY="# dinamic-mssql-backup-cron-tz"
UNINSTALL=0
CRON_USER="${MSSQL_BACKUP_CRON_USER:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall) UNINSTALL=1; shift ;;
    --user) CRON_USER="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,24p' "$0"
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

CRON_LINES="$(
  python3 - "${SCRIPT_DIR}" "${FULL_HOUR}" "${LOG_CMD}" "${FULL_CMD}" \
    "${MARKER_PREAMBLE}" "${MARKER_LOG}" "${MARKER_FULL}" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from paths import render_backup_cron_lines
for line in render_backup_cron_lines(
    full_hour_utc=int(sys.argv[2]),
    log_command=sys.argv[3],
    full_command=sys.argv[4],
    marker_preamble=sys.argv[5],
    marker_log=sys.argv[6],
    marker_full=sys.argv[7],
):
    print(line)
PY
)"
PREAMBLE_LINE="$(printf '%s\n' "${CRON_LINES}" | sed -n '1p')"
LOG_LINE="$(printf '%s\n' "${CRON_LINES}" | sed -n '2p')"
FULL_LINE="$(printf '%s\n' "${CRON_LINES}" | sed -n '3p')"

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

filter_managed() {
  printf '%s\n' "$1" | awk \
    -v m1="${MARKER_LOG}" -v m2="${MARKER_FULL}" \
    -v m3="${MARKER_PREAMBLE}" -v m4="${MARKER_TZ_LEGACY}" '
    index($0, m1) == 0 && index($0, m2) == 0 && index($0, m3) == 0 && index($0, m4) == 0 { print }
  '
}

assert_host_utc() {
  case "${MSSQL_BACKUP_ALLOW_NON_UTC_HOST:-false}" in
    true|TRUE|1|yes|YES)
      mssql_backup_log WARN "MSSQL_BACKUP_ALLOW_NON_UTC_HOST set — skipping UTC host check"
      return 0
      ;;
  esac

  local tz_name=""
  if [[ -r /etc/timezone ]]; then
    tz_name="$(tr -d '[:space:]' </etc/timezone || true)"
  fi
  if [[ -z "${tz_name}" ]] && command -v timedatectl >/dev/null 2>&1; then
    tz_name="$(timedatectl show -p Timezone --value 2>/dev/null || true)"
  fi
  if [[ -z "${tz_name}" ]] && [[ -L /etc/localtime ]]; then
    tz_name="$(readlink /etc/localtime | sed 's|.*/zoneinfo/||')"
  fi

  local offset
  offset="$(date +%z)"
  local decision
  decision="$(
    python3 - "${SCRIPT_DIR}" "${tz_name}" "${offset}" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from paths import host_timezone_is_utc
tz = sys.argv[2]
offset = sys.argv[3]  # e.g. +0000
seconds = None
if len(offset) == 5 and offset[0] in "+-" and offset[1:].isdigit():
    sign = 1 if offset[0] == "+" else -1
    seconds = sign * (int(offset[1:3]) * 3600 + int(offset[3:5]) * 60)
ok = host_timezone_is_utc(tz, seconds)
# Also accept zero offset even when tz name is empty/unknown.
if not ok and seconds == 0:
    ok = True
print("OK" if ok else "DENY")
print(tz or "(unknown)")
print(offset)
PY
  )"
  local status
  status="$(printf '%s\n' "${decision}" | sed -n '1p')"
  if [[ "${status}" != "OK" ]]; then
    mssql_backup_log ERROR \
      "host timezone is not UTC (tz=$(printf '%s\n' "${decision}" | sed -n '2p') offset=$(printf '%s\n' "${decision}" | sed -n '3p')). Configure the Ubuntu 22.04 host to UTC before installing backup cron (do not rely on CRON_TZ). Override with MSSQL_BACKUP_ALLOW_NON_UTC_HOST=true only for non-production."
    exit 4
  fi
  mssql_backup_log INFO "host timezone UTC precondition ok (tz=${tz_name:-unknown} offset=${offset})"
}

existing="$(crontab_list)"
filtered="$(filter_managed "${existing}")"

remove_managed_and_exit() {
  local reason="$1"
  crontab_install "${filtered}"
  mssql_backup_log INFO "${reason}"
  exit 0
}

if [[ "${UNINSTALL}" -eq 1 ]]; then
  remove_managed_and_exit "removed dinamic MSSQL backup cron entries"
fi

case "${MSSQL_BACKUP_ENABLED}" in
  true|TRUE|1|yes|YES) ;;
  *)
    remove_managed_and_exit \
      "MSSQL_BACKUP_ENABLED=${MSSQL_BACKUP_ENABLED}; removed managed backup cron entries (jobs will not run every 15m)"
    ;;
esac

assert_host_utc

new_crontab="$(
  printf '%s\n' "${filtered}"
  printf '%s\n' "${PREAMBLE_LINE}"
  printf '%s\n' "${LOG_LINE}"
  printf '%s\n' "${FULL_LINE}"
)"
new_crontab="$(printf '%s\n' "${new_crontab}" | awk 'NF||printed{printed=1;print}')"

crontab_install "${new_crontab}"
mssql_backup_log INFO "installed cron (host UTC) LOG=*/15 FULL=0 ${FULL_HOUR} * * * user=${CRON_USER:-current}"
mssql_backup_log INFO "logs under ${LOG_DIR}"
mssql_backup_log INFO "LOG requires recovery=FULL; if BACKUP LOG fails for missing chain, run FULL once"
