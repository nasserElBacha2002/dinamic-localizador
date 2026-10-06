#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
MAX_HEALTH_RETRIES="${DEPLOY_WEBSITE_HEALTH_RETRIES:-30}"
HEALTH_RETRY_SLEEP_SECONDS="${DEPLOY_WEBSITE_HEALTH_RETRY_SLEEP_SECONDS:-2}"
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
log_section "Deploy website in ${DEPLOY_PATH}"

cd "${DEPLOY_PATH}"
assert_deploy_env_file

bootstrap_website_host_port_in_env_file() {
  local default_port="8085"
  if grep -qE '^WEBSITE_HOST_PORT=' "${DEPLOY_ENV_FILE}"; then
    if grep -qE '^WEBSITE_HOST_PORT=[[:space:]]*$' "${DEPLOY_ENV_FILE}"; then
      sed -i "s|^WEBSITE_HOST_PORT=.*|WEBSITE_HOST_PORT=${default_port}|" "${DEPLOY_ENV_FILE}"
    fi
  else
    printf '\nWEBSITE_HOST_PORT=%s\n' "${default_port}" >> "${DEPLOY_ENV_FILE}"
  fi
}

bootstrap_website_host_port_in_env_file

WEBSITE_HOST_PORT="$(grep -E '^WEBSITE_HOST_PORT=' "${DEPLOY_ENV_FILE}" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
WEBSITE_HOST_PORT="${WEBSITE_HOST_PORT:-8085}"
export WEBSITE_HOST_PORT
log_section "Website host port: ${WEBSITE_HOST_PORT}"

WEBSITE_HEALTH_URL="${DEPLOY_WEBSITE_HEALTH_URL:-http://127.0.0.1:${WEBSITE_HOST_PORT}/health}"

if [[ -z "${WEBSITE_IMAGE:-}" ]]; then
  echo "ERROR: WEBSITE_IMAGE is required for production website deploy." >&2
  echo "NOTE: The server must pull a pre-built GHCR image; it must not run vite/tsc builds." >&2
  exit 1
fi

print_website_diagnostics() {
  print_compose_status
  log_section "Website logs (last 300 lines)"
  compose logs --tail=300 website || true
}

login_to_ghcr_if_configured() {
  if [[ -z "${GHCR_PULL_TOKEN:-}" ]]; then
    log_section "GHCR_PULL_TOKEN not set; assuming docker is already logged in to ghcr.io"
    return 0
  fi

  local username
  username="$(echo "${GHCR_PULL_USERNAME:-github}" | tr '[:upper:]' '[:lower:]')"
  log_section "Logging in to ghcr.io as ${username}"
  echo "${GHCR_PULL_TOKEN}" | docker login ghcr.io -u "${username}" --password-stdin
}

login_to_ghcr_if_configured

log_section "Recording WEBSITE_IMAGE in ${DEPLOY_ENV_FILE}"
if grep -qE '^WEBSITE_IMAGE=' "${DEPLOY_ENV_FILE}"; then
  sed -i "s|^WEBSITE_IMAGE=.*|WEBSITE_IMAGE=${WEBSITE_IMAGE}|" "${DEPLOY_ENV_FILE}"
else
  printf '\nWEBSITE_IMAGE=%s\n' "${WEBSITE_IMAGE}" >> "${DEPLOY_ENV_FILE}"
fi
export WEBSITE_IMAGE

log_section "Pulling website image from GHCR (no server-side build): ${WEBSITE_IMAGE}"
if ! compose pull website; then
  echo "ERROR: failed to pull website image ${WEBSITE_IMAGE}" >&2
  print_website_diagnostics
  exit 1
fi

log_section "Restarting website service only (--no-deps --no-build; other services will NOT be recreated)"
if ! compose up -d --no-deps --no-build website; then
  echo "ERROR: website container failed to start" >&2
  print_website_diagnostics
  exit 1
fi

print_compose_status

website_container_running() {
  local cid running
  cid="$(compose ps -q website 2>/dev/null || true)"
  if [[ -z "${cid}" ]]; then
    return 1
  fi

  running="$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || echo false)"
  [[ "${running}" == "true" ]]
}

log_section "Checking website health: ${WEBSITE_HEALTH_URL}"
log_section "Waiting up to ${MAX_HEALTH_RETRIES} attempts (${HEALTH_RETRY_SLEEP_SECONDS}s between retries)"

attempt=1
while [[ "${attempt}" -le "${MAX_HEALTH_RETRIES}" ]]; do
  if ! website_container_running; then
    echo "ERROR: website container is not running (attempt ${attempt}/${MAX_HEALTH_RETRIES})" >&2
    print_website_diagnostics
    exit 1
  fi

  if curl -fsS "${WEBSITE_HEALTH_URL}" >/dev/null; then
    log_section "Website health check passed on attempt ${attempt}/${MAX_HEALTH_RETRIES}"
    log_section "Website deploy completed successfully"
    exit 0
  fi

  if [[ "${attempt}" -lt "${MAX_HEALTH_RETRIES}" ]]; then
    echo "==> Health check not ready (attempt ${attempt}/${MAX_HEALTH_RETRIES}), retrying in ${HEALTH_RETRY_SLEEP_SECONDS}s..."
    sleep "${HEALTH_RETRY_SLEEP_SECONDS}"
  fi

  attempt=$((attempt + 1))
done

echo "ERROR: website health check failed after ${MAX_HEALTH_RETRIES} attempts" >&2
print_website_diagnostics
exit 1
