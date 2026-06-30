#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

if ! BACKEND_DIR="$(detect_backend_dir)"; then
  log_warn "Backend directory not detected"
  write_status_json "backend-detected" "skipped" "info" "Backend package not found"
  exit 0
fi

log_info "Backend directory: ${BACKEND_DIR}"

run_npm_script "${BACKEND_DIR}" "lint" "${AUDIT_RAW}/backend-eslint.txt" "backend-eslint" "medium"
run_typecheck "${BACKEND_DIR}" "${AUDIT_RAW}/backend-typecheck.txt" "backend-typecheck"
run_npm_script "${BACKEND_DIR}" "test" "${AUDIT_RAW}/backend-test.txt" "backend-test"
run_npm_script "${BACKEND_DIR}" "build" "${AUDIT_RAW}/backend-build.txt" "backend-build"
run_npm_audit_json "${BACKEND_DIR}" "${AUDIT_RAW}/backend-npm-audit.json" "backend-npm-audit"

exit 0
