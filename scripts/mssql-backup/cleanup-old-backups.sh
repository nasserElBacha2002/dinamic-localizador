#!/usr/bin/env bash
# Delete only managed backup files older than MSSQL_BACKUP_RETENTION_DAYS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

mssql_backup_load_env
mssql_backup_require_enabled
mkdir -p "${MSSQL_BACKUP_HOST_PATH}"

run_cleanup() {
  local deleted
  deleted="$(
    python3 - "${SCRIPT_DIR}" "${MSSQL_BACKUP_HOST_PATH}" "${MSSQL_BACKUP_DATABASE}" "${MSSQL_BACKUP_RETENTION_DAYS}" <<'PY'
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, sys.argv[1])
from paths import select_expired_managed_backups

host_dir = Path(sys.argv[2])
database = sys.argv[3]
retention_days = int(sys.argv[4])
names = sorted(p.name for p in host_dir.iterdir() if p.is_file())
expired = select_expired_managed_backups(
    names,
    database=database,
    now_utc=datetime.now(timezone.utc),
    retention_days=retention_days,
)
deleted = 0
for name in expired:
    path = host_dir / name
    # Extra guard: never follow symlinks outside host_dir.
    if path.is_symlink():
        print(f"skip symlink {name}", file=sys.stderr)
        continue
    path.unlink()
    deleted += 1
    print(name)
print(f"COUNT={deleted}")
PY
  )"

  local count
  count="$(printf '%s\n' "${deleted}" | awk -F= '/^COUNT=/ { print $2 }')"
  mssql_backup_log INFO "cleanup retentionDays=${MSSQL_BACKUP_RETENTION_DAYS} deleted=${count:-0}"
  printf '%s\n' "${deleted}" | awk '!/^COUNT=/' | while read -r name; do
    [[ -n "${name}" ]] && mssql_backup_log INFO "deleted managed backup file=${name}"
  done
}

mssql_backup_with_lock "${MSSQL_BACKUP_LOCK_FILE}" run_cleanup
