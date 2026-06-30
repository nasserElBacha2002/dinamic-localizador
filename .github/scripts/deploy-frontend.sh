#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
FRONTEND_HEALTH_URL="${DEPLOY_FRONTEND_HEALTH_URL:-http://127.0.0.1:8084/}"
MAX_HEALTH_RETRIES="${DEPLOY_FRONTEND_HEALTH_RETRIES:-30}"
HEALTH_RETRY_SLEEP_SECONDS="${DEPLOY_FRONTEND_HEALTH_RETRY_SLEEP_SECONDS:-2}"
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
log_section "Deploy frontend in ${DEPLOY_PATH}"

cd "${DEPLOY_PATH}"
assert_deploy_env_file

if [[ -z "${FRONTEND_IMAGE:-}" ]]; then
  echo "ERROR: FRONTEND_IMAGE is required for production frontend deploy." >&2
  echo "NOTE: The server must pull a pre-built GHCR image; it must not run vite/tsc builds." >&2
  exit 1
fi

print_frontend_diagnostics() {
  print_compose_status
  log_section "Frontend logs (last 300 lines)"
  compose logs --tail=300 frontend || true
}

login_to_ghcr_if_configured() {
  if [[ -z "${GHCR_PULL_TOKEN:-}" ]]; then
    log_section "GHCR_PULL_TOKEN not set; assuming docker is already logged in to ghcr.io"
    return 0
  fi

  local username="${GHCR_PULL_USERNAME:-github}"
  log_section "Logging in to ghcr.io as ${username}"
  echo "${GHCR_PULL_TOKEN}" | docker login ghcr.io -u "${username}" --password-stdin
}

login_to_ghcr_if_configured

log_section "Recording FRONTEND_IMAGE in ${DEPLOY_ENV_FILE}"
if grep -qE '^FRONTEND_IMAGE=' "${DEPLOY_ENV_FILE}"; then
  sed -i "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${FRONTEND_IMAGE}|" "${DEPLOY_ENV_FILE}"
else
  printf '\nFRONTEND_IMAGE=%s\n' "${FRONTEND_IMAGE}" >> "${DEPLOY_ENV_FILE}"
fi
export FRONTEND_IMAGE

log_section "Pulling frontend image from GHCR (no server-side build): ${FRONTEND_IMAGE}"
if ! compose pull frontend; then
  echo "ERROR: failed to pull frontend image ${FRONTEND_IMAGE}" >&2
  print_frontend_diagnostics
  exit 1
fi

log_section "Restarting frontend service only (--no-deps --no-build; backend/sqlserver will NOT be recreated)"
if ! compose up -d --no-deps --no-build frontend; then
  echo "ERROR: frontend container failed to start" >&2
  print_frontend_diagnostics
  exit 1
fi

print_compose_status

frontend_container_running() {
  local cid running
  cid="$(compose ps -q frontend 2>/dev/null || true)"
  if [[ -z "${cid}" ]]; then
    return 1
  fi

  running="$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || echo false)"
  [[ "${running}" == "true" ]]
}

log_section "Checking frontend health: ${FRONTEND_HEALTH_URL}"
log_section "Waiting up to ${MAX_HEALTH_RETRIES} attempts (${HEALTH_RETRY_SLEEP_SECONDS}s between retries)"

attempt=1
while [[ "${attempt}" -le "${MAX_HEALTH_RETRIES}" ]]; do
  if ! frontend_container_running; then
    echo "ERROR: frontend container is not running (attempt ${attempt}/${MAX_HEALTH_RETRIES})" >&2
    print_frontend_diagnostics
    exit 1
  fi

  if curl -fsS "${FRONTEND_HEALTH_URL}" >/dev/null; then
    log_section "Frontend health check passed on attempt ${attempt}/${MAX_HEALTH_RETRIES}"
    log_section "Frontend deploy completed successfully"
    exit 0
  fi

  if [[ "${attempt}" -lt "${MAX_HEALTH_RETRIES}" ]]; then
    echo "==> Health check not ready (attempt ${attempt}/${MAX_HEALTH_RETRIES}), retrying in ${HEALTH_RETRY_SLEEP_SECONDS}s..."
    sleep "${HEALTH_RETRY_SLEEP_SECONDS}"
  fi

  attempt=$((attempt + 1))
done

echo "ERROR: frontend health check failed after ${MAX_HEALTH_RETRIES} attempts" >&2
print_frontend_diagnostics
exit 1
