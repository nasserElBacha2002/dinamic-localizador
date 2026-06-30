#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

NPM_AUDIT_TXT="${AUDIT_RAW}/security-npm-audit.txt"
SECRETS_MD="${AUDIT_RAW}/security-secrets-audit.md"
DOCKER_MD="${AUDIT_RAW}/security-docker-audit.md"
ENV_MD="${AUDIT_RAW}/security-env-audit.md"

{
  echo "=== Security npm audit (high+) ==="
  for dir in "$(detect_backend_dir 2>/dev/null || true)" "$(detect_frontend_dir 2>/dev/null || true)"; do
    [[ -z "${dir}" || ! -d "${dir}" ]] && continue
    echo "## ${dir#${REPO_ROOT}/}"
    (cd "${dir}" && npm audit --audit-level=high 2>&1) || true
    echo
  done
} > "${NPM_AUDIT_TXT}"

secrets_exit=0
python3 "${SCRIPT_DIR}/audit_secrets.py" "${SECRETS_MD}" || secrets_exit=$?
if [[ "${secrets_exit}" -ne 0 ]]; then
  write_status_json "security-secrets" "fail" "critical" "Potential hardcoded secrets detected"
else
  write_status_json "security-secrets" "pass" "none" "No hardcoded secrets found"
fi

env_exit=0
python3 "${SCRIPT_DIR}/audit_env_documentation.py" "${ENV_MD}" || env_exit=$?
if [[ "${env_exit}" -ne 0 ]]; then
  write_status_json "security-env" "fail" "medium" "Environment variables used but not documented"
else
  write_status_json "security-env" "pass" "info" "Environment variables documented"
fi

{
  echo "# Docker security audit"
  echo
  for f in Dockerfile docker-compose.yml docker-compose.prod.yml backend/Dockerfile frontend/Dockerfile; do
    if [[ -f "${REPO_ROOT}/${f}" ]]; then
      echo "## ${f}"
      if grep -n '1433\|sqlserver' "${REPO_ROOT}/${f}" 2>/dev/null | grep -v '127.0.0.1' | grep -q 'ports'; then
        echo "- WARNING: Database port mapping may be exposed (review compose overrides)."
      fi
      if grep -qi 'USER root' "${REPO_ROOT}/${f}" 2>/dev/null; then
        echo "- WARNING: Container may run as root."
      fi
      if ! grep -qi 'HEALTHCHECK' "${REPO_ROOT}/${f}" 2>/dev/null; then
        echo "- INFO: No HEALTHCHECK in ${f} (may be defined in docker-compose.prod.yml)."
      fi
      grep -nE 'password|secret|token' "${REPO_ROOT}/${f}" 2>/dev/null | sed 's/=.*/=***MASKED***/' || true
      echo
    fi
  done
  if [[ -f "${REPO_ROOT}/.dockerignore" ]]; then
    echo "- .dockerignore present"
  else
    echo "- WARNING: .dockerignore missing"
  fi
} > "${DOCKER_MD}"

write_status_json "security-audit" "pass" "info" "Security audit artifacts generated"
exit 0
