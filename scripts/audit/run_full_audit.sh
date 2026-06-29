#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

RUN_TS="$(timestamp_utc)"
export AUDIT_RUN_TS="${RUN_TS}"

log_info "Starting full audit at ${RUN_TS}"
log_info "Repository root: ${REPO_ROOT}"

rm -f "${AUDIT_META}"/*.status.json 2>/dev/null || true

run_step() {
  local script_name="$1"
  local script_path="${SCRIPT_DIR}/${script_name}"
  if [[ ! -f "${script_path}" ]]; then
    log_warn "Missing script: ${script_name}"
    return 0
  fi
  log_info "Running ${script_name}"
  bash "${script_path}" || log_warn "${script_name} reported errors (continuing)"
}

run_step "run_backend_audit.sh"
run_step "run_frontend_audit.sh"
run_step "run_backend_architecture_audit.sh"
run_step "run_frontend_architecture_audit.sh"
run_step "run_security_audit.sh"

log_info "Generating audit summary"
python3 "${SCRIPT_DIR}/generate_audit_summary.py" || log_warn "generate_audit_summary.py failed"

SNAPSHOT_DIR="${AUDIT_RUNS}/${RUN_TS}"
mkdir -p "${SNAPSHOT_DIR}"

shopt -s nullglob
for item in "${AUDIT_RAW}"/*; do
  base="$(basename "${item}")"
  [[ "${base}" == "runs" ]] && continue
  cp -R "${item}" "${SNAPSHOT_DIR}/" 2>/dev/null || true
done
shopt -u nullglob

echo "${RUN_TS}" > "${AUDIT_RAW}/LATEST_RUN.txt"
log_info "Snapshot saved to ${SNAPSHOT_DIR}"

python3 "${SCRIPT_DIR}/enforce_quality_gate.py" || true

log_info "Full audit completed (local mode is non-blocking by default)"
exit 0
