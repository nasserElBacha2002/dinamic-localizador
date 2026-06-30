#!/usr/bin/env bash
# Manual operator script — starts SQL Server only.
# NEVER invoked automatically by deploy workflows.
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/dinamic-attendance-deploy.lock}"

exec 9>"${DEPLOY_LOCK_FILE}"
echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Waiting for deploy lock: ${DEPLOY_LOCK_FILE}"
flock 9
echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Acquired deploy lock"

cd "${DEPLOY_PATH}"

# shellcheck source=/dev/null
source "${DEPLOY_PATH}/.github/scripts/deploy-compose.sh"

log_section "Manual SQL Server provisioning in ${DEPLOY_PATH}"
assert_deploy_env_file

log_section "Starting sqlserver only (db-init and app services are NOT started)"
if ! compose up -d sqlserver; then
  echo "ERROR: failed to start sqlserver" >&2
  compose logs --tail=100 sqlserver || true
  exit 1
fi

print_compose_status

log_section "Waiting for sqlserver to become healthy"
assert_sqlserver_running_and_healthy

log_section "SQL Server is running and healthy"
echo "NOTE: This script does not run db-init or migrations."
echo "NOTE: Run backend deploy separately after SQL Server is up."
