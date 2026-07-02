#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
BACKEND_HEALTH_URL="${DEPLOY_BACKEND_HEALTH_URL:-http://127.0.0.1:3004/api/health}"
MAX_HEALTH_RETRIES="${DEPLOY_BACKEND_HEALTH_RETRIES:-30}"
HEALTH_RETRY_SLEEP_SECONDS="${DEPLOY_BACKEND_HEALTH_RETRY_SLEEP_SECONDS:-2}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/dinamic-attendance-deploy.lock}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-develop}"

exec 9>"${DEPLOY_LOCK_FILE}"
echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Waiting for deploy lock: ${DEPLOY_LOCK_FILE}"
flock 9
echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] Acquired deploy lock"

cd "${DEPLOY_PATH}"
git fetch origin "${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"
git reset --hard "origin/${DEPLOY_BRANCH}"

# shellcheck source=/dev/null
source "${DEPLOY_PATH}/.github/scripts/deploy-compose.sh"

log_section "Repository updated to $(git rev-parse --short HEAD)"
log_section "Deploy backend in ${DEPLOY_PATH}"

cd "${DEPLOY_PATH}"
assert_deploy_env_file
assert_env_keys_nonempty \
  TWILIO_ARRIVAL_REMINDER_CONTENT_SID \
  TWILIO_EXIT_REMINDER_CONTENT_SID \
  TWILIO_TEMPLATE_NO_CHECKIN_SID

print_backend_diagnostics() {
  print_compose_status
  log_section "Backend logs (last 300 lines)"
  compose logs --tail=300 backend || true
}

print_migration_diagnostics() {
  print_compose_status
  log_section "Migrations logs (last 300 lines)"
  compose logs --tail=300 migrations || true
}

assert_sqlserver_running_and_healthy

log_section "Building migrations image (target: migrations)"
export DOCKER_BUILDKIT=1
if ! compose build migrations; then
  echo "ERROR: migrations image build failed" >&2
  print_migration_diagnostics
  exit 1
fi

log_section "Running migrations against existing SQL Server (--no-deps; sqlserver/db-init will NOT be recreated)"
if ! compose run --rm --no-deps migrations; then
  echo "ERROR: migrations failed" >&2
  print_migration_diagnostics
  exit 1
fi

log_section "Building backend image (target: production)"
if ! compose build backend; then
  echo "ERROR: backend image build failed" >&2
  print_backend_diagnostics
  exit 1
fi

log_section "Restarting backend service only (--no-deps)"
if ! compose up -d --no-deps backend; then
  echo "ERROR: backend container failed to start" >&2
  print_backend_diagnostics
  exit 1
fi

print_compose_status

backend_container_running() {
  local cid running
  cid="$(compose ps -q backend 2>/dev/null || true)"
  if [[ -z "${cid}" ]]; then
    return 1
  fi

  running="$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || echo false)"
  [[ "${running}" == "true" ]]
}

log_section "Checking backend health: ${BACKEND_HEALTH_URL}"
log_section "Waiting up to ${MAX_HEALTH_RETRIES} attempts (${HEALTH_RETRY_SLEEP_SECONDS}s between retries)"

attempt=1
while [[ "${attempt}" -le "${MAX_HEALTH_RETRIES}" ]]; do
  if ! backend_container_running; then
    echo "ERROR: backend container is not running (attempt ${attempt}/${MAX_HEALTH_RETRIES})" >&2
    print_backend_diagnostics
    exit 1
  fi

  health_response=""
  if health_response="$(curl -fsS "${BACKEND_HEALTH_URL}")"; then
    log_section "Backend health check passed on attempt ${attempt}/${MAX_HEALTH_RETRIES}"
    echo "${health_response}"
    log_section "Backend deploy completed successfully"
    exit 0
  fi

  if [[ "${attempt}" -lt "${MAX_HEALTH_RETRIES}" ]]; then
    echo "==> Health check not ready (attempt ${attempt}/${MAX_HEALTH_RETRIES}), retrying in ${HEALTH_RETRY_SLEEP_SECONDS}s..."
    sleep "${HEALTH_RETRY_SLEEP_SECONDS}"
  fi

  attempt=$((attempt + 1))
done

echo "ERROR: backend health check failed after ${MAX_HEALTH_RETRIES} attempts" >&2
print_backend_diagnostics
exit 1
