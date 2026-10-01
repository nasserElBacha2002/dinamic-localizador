#!/usr/bin/env bash
# FULL backup + retention cleanup (used by install-cron.sh daily entry).
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
