#!/usr/bin/env bash
# Optional deep security scan (manual). Fast scan is default in run_security_audit.sh.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

export AUDIT_SECURITY_MODE=deep

log_info "Running deep security audit (optional, slower)"
bash "${SCRIPT_DIR}/run_security_audit.sh"

DEEP_OUT="${AUDIT_RAW}/security-deep-notes.md"
{
  echo "# Deep security audit notes"
  echo
  echo "Mode: deep (manual)"
  echo "Fast scan remains the default for \`npm run audit\`."
  echo
  if command -v gitleaks >/dev/null 2>&1; then
    echo "## gitleaks"
    gitleaks detect --no-banner --source "${REPO_ROOT}" --redact 2>&1 || true
  else
    echo "gitleaks not installed — skipped."
    echo "Install locally if you need deeper secret scanning."
  fi
} > "${DEEP_OUT}"

log_info "Deep security notes written to ${DEEP_OUT}"
exit 0
