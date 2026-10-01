#!/usr/bin/env bash
# Convenience wrapper: FULL|LOG backup then optional retention cleanup.
# Example host cron (UTC):
#   15 * * * * /opt/dinamic-attendance/dinamic-localizador/scripts/mssql-backup/run-backup.sh LOG
#   0 3 * * *  /opt/dinamic-attendance/dinamic-localizador/scripts/mssql-backup/run-backup.sh FULL && \
#              /opt/dinamic-attendance/dinamic-localizador/scripts/mssql-backup/cleanup-old-backups.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIND="${1:-}"
if [[ "${KIND}" != "FULL" && "${KIND}" != "LOG" ]]; then
  echo "Usage: $0 FULL|LOG" >&2
  exit 1
fi

"${SCRIPT_DIR}/run-backup.sh" "${KIND}"
if [[ "${KIND}" == "FULL" ]]; then
  "${SCRIPT_DIR}/cleanup-old-backups.sh"
fi
