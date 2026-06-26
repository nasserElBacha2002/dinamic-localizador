#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
BACKEND_HEALTH_URL="${DEPLOY_BACKEND_HEALTH_URL:-http://127.0.0.1:3004/api/health}"

echo "==> Deploy backend in ${DEPLOY_PATH}"

cd "${DEPLOY_PATH}"

echo "==> Running migrations"
docker compose --env-file .env ${COMPOSE_FILES} run --rm migrations

echo "==> Building backend"
docker compose --env-file .env ${COMPOSE_FILES} build backend

echo "==> Starting backend without dependencies"
docker compose --env-file .env ${COMPOSE_FILES} up -d --no-deps backend

echo "==> Service status"
docker compose --env-file .env ${COMPOSE_FILES} ps

echo "==> Checking backend health: ${BACKEND_HEALTH_URL}"
curl -fsS "${BACKEND_HEALTH_URL}" > /dev/null

echo "==> Backend deploy completed successfully"
