#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/dinamic-attendance/dinamic-localizador}"
FRONTEND_HEALTH_URL="${DEPLOY_FRONTEND_HEALTH_URL:-http://127.0.0.1:8084/}"

# shellcheck source=/dev/null
source "${DEPLOY_PATH}/.github/scripts/deploy-compose.sh"

echo "==> Deploy frontend in ${DEPLOY_PATH}"

cd "${DEPLOY_PATH}"
assert_deploy_env_file

echo "==> Building frontend"
compose build frontend

echo "==> Starting frontend"
compose up -d frontend

echo "==> Service status"
compose ps

print_frontend_diagnostics() {
  echo "==> Docker Compose service status"
  compose ps || true
  echo "==> Frontend logs (last 300 lines)"
  compose logs --tail=300 frontend || true
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
