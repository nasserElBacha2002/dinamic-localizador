#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

RUN_TS="$(timestamp_utc)"
export AUDIT_RUN_TS="${RUN_TS}"
export AUDIT_RUN_ID="${RUN_TS}"

log_info "Starting full audit at ${RUN_TS}"
log_info "Repository root: ${REPO_ROOT}"

rm -f "${AUDIT_META}"/*.status.json 2>/dev/null || true

# Initialize run metadata and invalidate stale canonical findings
python3 - <<PY
import sys
from pathlib import Path
sys.path.insert(0, "${SCRIPT_DIR}")
from framework.run_meta import start_full_run
start_full_run("${RUN_TS}")
print("current-run initialized: ${RUN_TS}")
PY

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

log_info "Running deep audit framework (normalized findings)"
FRAMEWORK_ARGS=(--run-id "${RUN_TS}" --run-type full --print-summary)
if [[ "${AUDIT_STRICT:-0}" == "1" ]]; then
  FRAMEWORK_ARGS+=(--fail-on-error)
fi

framework_rc=0
python3 "${SCRIPT_DIR}/run_framework_audit.py" "${FRAMEWORK_ARGS[@]}" || framework_rc=$?
if [[ "${framework_rc}" -ne 0 ]]; then
  log_warn "run_framework_audit.py failed with exit ${framework_rc}"
  python3 - <<PY
import sys
sys.path.insert(0, "${SCRIPT_DIR}")
from framework.run_meta import mark_framework_status
mark_framework_status(
    status="error",
    failure_type="audit_framework_failure",
    message="run_framework_audit.py exit ${framework_rc}",
    blocking=("${AUDIT_STRICT:-0}" == "1"),
)
PY
  write_status_json "framework-deep-audit" "error" "critical" "audit_framework_failure exit ${framework_rc}"
  # Patch status json with failure_type/blocking for gate
  python3 - <<PY
import json
from pathlib import Path
path = Path("${AUDIT_META}") / "framework-deep-audit.status.json"
data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
data.update({
    "check": "framework-deep-audit",
    "status": "error",
    "severity": "critical",
    "message": "audit_framework_failure exit ${framework_rc}",
    "failure_type": "audit_framework_failure",
    "blocking": True if "${AUDIT_STRICT:-0}" == "1" else False,
    "run_id": "${RUN_TS}",
})
path.write_text(json.dumps(data, indent=2), encoding="utf-8")
PY
fi

log_info "Generating audit summary"
if ! python3 "${SCRIPT_DIR}/generate_audit_summary.py"; then
  log_warn "generate_audit_summary.py failed"
  if [[ "${AUDIT_STRICT:-0}" == "1" ]]; then
    exit 1
  fi
fi

SNAPSHOT_DIR="${AUDIT_RUNS}/${RUN_TS}"
mkdir -p "${SNAPSHOT_DIR}"

shopt -s nullglob
for item in "${AUDIT_RAW}"/*; do
  base="$(basename "${item}")"
  [[ "${base}" == "runs" ]] && continue
  cp -R "${item}" "${SNAPSHOT_DIR}/" 2>/dev/null || true
done
# Also snapshot canonical findings for this run
for item in findings.json audit-report.json current-run.json; do
  if [[ -f "${AUDIT_DIR}/${item}" ]]; then
    cp "${AUDIT_DIR}/${item}" "${SNAPSHOT_DIR}/" 2>/dev/null || true
  fi
done
shopt -u nullglob

echo "${RUN_TS}" > "${AUDIT_RAW}/LATEST_RUN.txt"
log_info "Snapshot saved to ${SNAPSHOT_DIR}"

if [[ "${AUDIT_STRICT:-0}" == "1" ]]; then
  # Strict gate is enforced by the npm script after this shell; still run diagnostic print
  python3 "${SCRIPT_DIR}/enforce_quality_gate.py" || true
  log_info "Full audit completed (strict mode — quality gate runs next)"
else
  python3 "${SCRIPT_DIR}/enforce_quality_gate.py" || true
  log_info "Full audit completed (diagnostic mode — non-blocking)"
  log_info "Use 'npm run audit:strict' to enforce quality gate"
fi
exit 0
