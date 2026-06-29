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

{
  echo "# Security secrets audit"
  echo
  echo "Heuristic scan for hardcoded secrets (values masked)."
  echo
  findings=0
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    findings=$((findings + 1))
    file="${match%%:*}"
    rest="${match#*:}"
    line_no="${rest%%:*}"
    masked=$(echo "${rest#*:}" | sed -E 's/(=|:)[[:space:]]*.+/=***MASKED***/')
    echo "- ${file#${REPO_ROOT}/}:${line_no} ${masked}"
  done < <(
    find "${REPO_ROOT}/backend/src" "${REPO_ROOT}/frontend/src" \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' \) \
      ! -name '*.test.ts' ! -name '*.test.tsx' \
      -print0 2>/dev/null \
      | xargs -0 grep -HnE \
        'TWILIO_AUTH_TOKEN[[:space:]]*=[[:space:]]*("|'"'"')[^"'"'"']{8,}|TWILIO_ACCOUNT_SID[[:space:]]*=[[:space:]]*AC[a-zA-Z0-9]{20,}|JWT_SECRET[[:space:]]*=[[:space:]]*("|'"'"')[^"'"'"']{8,}|GOOGLE_MAPS_API_KEY[[:space:]]*=[[:space:]]*AIza[0-9A-Za-z_-]{20,}|password[[:space:]]*=[[:space:]]*("|'"'"')[^"'"'"']{4,}|api[_-]?key[[:space:]]*=[[:space:]]*("|'"'"')[^"'"'"']{8,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY' \
        2>/dev/null || true
  )

  if [[ "${findings}" -eq 0 ]]; then
    echo "No obvious hardcoded secrets detected."
    write_status_json "security-secrets" "pass" "none" "No hardcoded secrets found"
  else
    echo
    echo "Total findings: ${findings}"
    write_status_json "security-secrets" "fail" "critical" "${findings} potential hardcoded secrets"
  fi
} > "${SECRETS_MD}"

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
        echo "- INFO: No HEALTHCHECK in ${f} (may be defined elsewhere)."
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

{
  echo "# Environment configuration audit"
  echo
  for example in .env.example backend/.env.example; do
    if [[ -f "${REPO_ROOT}/${example}" ]]; then
      echo "## ${example}"
      for key in CORS_ALLOWED_ORIGINS DB_ENCRYPT DB_TRUST_SERVER_CERTIFICATE TWILIO_WEBHOOK_URL TWILIO_VALIDATE_SIGNATURE BOT_OPERATION_TIMEZONE BOT_DEFAULT_RADIUS_METERS TWILIO_ARRIVAL_REMINDER_CONTENT_SID TWILIO_EXIT_REMINDER_CONTENT_SID; do
        if grep -q "^${key}=" "${REPO_ROOT}/${example}"; then
          echo "- ${key}: documented"
        else
          echo "- ${key}: MISSING in example"
        fi
      done
      echo
    fi
  done
} > "${ENV_MD}"

write_status_json "security-audit" "pass" "info" "Security audit artifacts generated"
exit 0
