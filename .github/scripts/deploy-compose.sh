#!/usr/bin/env bash

DEPLOY_ENV_FILE="${DEPLOY_PATH}/.env"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

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
  docker compose --env-file "${DEPLOY_ENV_FILE}" ${COMPOSE_FILES} "$@"
}
