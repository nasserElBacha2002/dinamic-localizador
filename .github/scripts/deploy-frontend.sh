#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
FRONTEND_HEALTH_URL="${DEPLOY_FRONTEND_HEALTH_URL:-http://127.0.0.1:8084/}"

echo "==> Deploy frontend in ${DEPLOY_PATH}"

cd "${DEPLOY_PATH}"

echo "==> Building frontend"
docker compose --env-file .env ${COMPOSE_FILES} build frontend

echo "==> Starting frontend"
docker compose --env-file .env ${COMPOSE_FILES} up -d frontend

echo "==> Service status"
docker compose --env-file .env ${COMPOSE_FILES} ps

print_frontend_diagnostics() {
  echo "==> Docker Compose service status"
  docker compose --env-file .env ${COMPOSE_FILES} ps || true
  echo "==> Frontend logs (last 200 lines)"
  docker compose --env-file .env ${COMPOSE_FILES} logs --tail=200 frontend || true
}

echo "==> Frontend health check: ${FRONTEND_HEALTH_URL}"
if health_response="$(curl -fsS "${FRONTEND_HEALTH_URL}")"; then
  echo "==> Health response:"
  echo "${health_response}"
  echo "==> Frontend deploy completed successfully"
  exit 0
fi

echo "==> Frontend health check failed"
print_frontend_diagnostics
exit 1
