#!/usr/bin/env bash

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
DEPLOY_ENV_FILE="${DEPLOY_PATH}/.env"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-develop}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/dinamic-attendance-deploy.lock}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dinamic-attendance}"

log_section() {
  echo ""
  echo "==> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

assert_deploy_env_file() {
  if [[ ! -f "${DEPLOY_ENV_FILE}" ]]; then
    echo "ERROR: missing ${DEPLOY_ENV_FILE}" >&2
    echo "NOTE: Docker deploy reads the root .env at DEPLOY_PATH, not backend/.env" >&2
    exit 1
  fi
}

assert_env_keys_nonempty() {
  local missing=()

  for key in "$@"; do
    if ! grep -qE "^${key}=.+" "${DEPLOY_ENV_FILE}"; then
      missing+=("${key}")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: ${DEPLOY_ENV_FILE} is missing or has empty values for: ${missing[*]}" >&2
    echo "NOTE: Docker deploy reads the root .env at DEPLOY_PATH, not backend/.env" >&2
    exit 1
  fi
}

compose() {
  docker compose \
    --project-name "${COMPOSE_PROJECT_NAME}" \
    --env-file "${DEPLOY_ENV_FILE}" \
    ${COMPOSE_FILES} \
    "$@"
}

print_compose_status() {
  log_section "Docker Compose service status"
  compose ps || true
}

assert_sqlserver_running_and_healthy() {
  log_section "Verifying SQL Server (existing container; deploy will NOT recreate sqlserver/db-init)"

  local cid
  cid="$(compose ps -q sqlserver 2>/dev/null || true)"
  if [[ -z "${cid}" ]]; then
    echo "ERROR: sqlserver container is not running." >&2
    echo "NOTE: Production deploy does not start or recreate the database stack." >&2
    echo "NOTE: Provision sqlserver separately before running backend deploy." >&2
    exit 1
  fi

  local running
  running="$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || echo false)"
  if [[ "${running}" != "true" ]]; then
    echo "ERROR: sqlserver container exists but is not running." >&2
    compose logs --tail=100 sqlserver || true
    exit 1
  fi

  local health_status
  health_status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid}" 2>/dev/null || echo unknown)"

  if [[ "${health_status}" == "healthy" ]]; then
    log_section "SQL Server is healthy"
    return 0
  fi

  if [[ "${health_status}" == "none" ]]; then
    log_section "SQL Server is running (no healthcheck reported; continuing)"
    return 0
  fi

  local attempt=1
  local max_attempts=30
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    health_status="$(docker inspect -f '{{.State.Health.Status}}' "${cid}" 2>/dev/null || echo unknown)"
    if [[ "${health_status}" == "healthy" ]]; then
      log_section "SQL Server became healthy on attempt ${attempt}/${max_attempts}"
      return 0
    fi
    if [[ "${health_status}" == "unhealthy" ]]; then
      echo "ERROR: sqlserver container is unhealthy." >&2
      compose logs --tail=100 sqlserver || true
      exit 1
    fi
    echo "==> Waiting for sqlserver health (${health_status}, attempt ${attempt}/${max_attempts})..."
    sleep 2
    attempt=$((attempt + 1))
  done

  echo "ERROR: sqlserver did not become healthy in time." >&2
  compose logs --tail=100 sqlserver || true
  exit 1
}
