#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
BACKEND_HEALTH_URL="${DEPLOY_BACKEND_HEALTH_URL:-http://127.0.0.1:3004/api/health}"
MAX_HEALTH_RETRIES="${DEPLOY_BACKEND_HEALTH_RETRIES:-30}"
HEALTH_RETRY_SLEEP_SECONDS="${DEPLOY_BACKEND_HEALTH_RETRY_SLEEP_SECONDS:-2}"

# shellcheck source=/dev/null
source "${DEPLOY_PATH}/.github/scripts/deploy-compose.sh"

echo "==> Deploy backend in ${DEPLOY_PATH}"

cd "${DEPLOY_PATH}"
assert_deploy_env_file
assert_env_keys_nonempty \
  TWILIO_ARRIVAL_REMINDER_CONTENT_SID \
  TWILIO_EXIT_REMINDER_CONTENT_SID

print_compose_status() {
  echo "==> Docker Compose service status"
  compose ps || true
}

print_backend_diagnostics() {
  print_compose_status
  echo "==> Backend logs (last 300 lines)"
  compose logs --tail=300 backend || true
}

print_migration_diagnostics() {
  print_compose_status
  echo "==> Migrations logs (last 300 lines)"
  compose logs --tail=300 migrations || true
}

echo "==> Running migrations"
if ! compose run --rm migrations; then
  echo "==> Migrations failed"
  print_migration_diagnostics
  exit 1
fi

echo "==> Building backend"
if ! compose build backend; then
  echo "==> Backend image build failed"
  print_backend_diagnostics
  exit 1
fi

echo "==> Starting backend without dependencies"
if ! compose up -d --no-deps backend; then
  echo "==> Backend container failed to start"
  print_backend_diagnostics
  exit 1
fi

echo "==> Service status"
compose ps

backend_container_running() {
  local cid running
  cid="$(compose ps -q backend 2>/dev/null || true)"
  if [[ -z "${cid}" ]]; then
    return 1
  fi

  running="$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || echo false)"
  [[ "${running}" == "true" ]]
}

echo "==> Checking backend health: ${BACKEND_HEALTH_URL}"
echo "==> Waiting up to ${MAX_HEALTH_RETRIES} attempts (${HEALTH_RETRY_SLEEP_SECONDS}s between retries)"

attempt=1
while [[ "${attempt}" -le "${MAX_HEALTH_RETRIES}" ]]; do
  if ! backend_container_running; then
    echo "==> Backend container is not running (attempt ${attempt}/${MAX_HEALTH_RETRIES})"
    print_backend_diagnostics
    exit 1
  fi

  health_response=""
  if health_response="$(curl -fsS "${BACKEND_HEALTH_URL}")"; then
    echo "==> Backend health check passed on attempt ${attempt}/${MAX_HEALTH_RETRIES}"
    echo "==> Health response:"
    echo "${health_response}"
    echo "==> Backend deploy completed successfully"
    exit 0
  fi

  if [[ "${attempt}" -lt "${MAX_HEALTH_RETRIES}" ]]; then
    echo "==> Health check not ready (attempt ${attempt}/${MAX_HEALTH_RETRIES}), retrying in ${HEALTH_RETRY_SLEEP_SECONDS}s..."
    sleep "${HEALTH_RETRY_SLEEP_SECONDS}"
  fi

  attempt=$((attempt + 1))
done

echo "==> Backend health check failed after ${MAX_HEALTH_RETRIES} attempts"
print_backend_diagnostics
exit 1
