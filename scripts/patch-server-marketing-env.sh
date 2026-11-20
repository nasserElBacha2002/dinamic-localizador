#!/usr/bin/env bash
# Idempotent marketing-demo + landing CORS patch for production .env (run on server).
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
ENV_FILE="${DEPLOY_PATH}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

backup="${ENV_FILE}.bak.$(date -u +%Y%m%d%H%M%S)"
cp "${ENV_FILE}" "${backup}"
echo "Backup: ${backup}"

set_kv() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

ensure_cors_origin() {
  local origin="$1"
  local current
  current="$(grep -E '^CORS_ALLOWED_ORIGINS=' "${ENV_FILE}" | tail -1 | cut -d= -f2- || true)"
  if [[ -z "${current}" ]]; then
    set_kv CORS_ALLOWED_ORIGINS "${origin}"
    return
  fi
  if [[ ",${current}," == *",${origin},"* ]]; then
    return
  fi
  set_kv CORS_ALLOWED_ORIGINS "${current},${origin}"
}

set_kv MARKETING_DEMO_LEAD_TO "${MARKETING_DEMO_LEAD_TO:-nasserelbacha@dinamicoperations.com}"
set_kv MARKETING_DEMO_RATE_LIMIT_WINDOW_MINUTES "${MARKETING_DEMO_RATE_LIMIT_WINDOW_MINUTES:-15}"
set_kv MARKETING_DEMO_RATE_LIMIT_MAX "${MARKETING_DEMO_RATE_LIMIT_MAX:-12}"
set_kv MARKETING_DEMO_RATE_LIMIT_MAX_PER_EMAIL "${MARKETING_DEMO_RATE_LIMIT_MAX_PER_EMAIL:-3}"
set_kv MARKETING_DEMO_DEDUP_WINDOW_MINUTES "${MARKETING_DEMO_DEDUP_WINDOW_MINUTES:-30}"

ensure_cors_origin "https://dinamicoperations.com"
ensure_cors_origin "https://www.dinamicoperations.com"

echo "Updated keys (values hidden):"
grep -E '^(MARKETING_DEMO_|CORS_ALLOWED_ORIGINS=)' "${ENV_FILE}" | sed 's/=.*/=***/' || true

echo "Recreate backend to apply env:"
echo "  cd ${DEPLOY_PATH} && docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml up -d backend"