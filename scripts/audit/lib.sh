#!/usr/bin/env bash
# Shared helpers for local code audits.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUDIT_DIR="${REPO_ROOT}/audit"
AUDIT_RAW="${AUDIT_DIR}/raw"
AUDIT_META="${AUDIT_RAW}/_meta"
AUDIT_RUNS="${AUDIT_RAW}/runs"

mkdir -p "${AUDIT_RAW}" "${AUDIT_META}" "${AUDIT_RUNS}"

log_info() {
  echo "[audit] $*"
}

log_warn() {
  echo "[audit][warn] $*" >&2
}

log_skip() {
  echo "[audit][skip] $*"
}

timestamp_utc() {
  date -u +"%Y%m%d-%H%M%S"
}

detect_frontend_dir() {
  for candidate in "${REPO_ROOT}/frontend" "${REPO_ROOT}/apps/frontend" "${REPO_ROOT}/apps/web"; do
    if [[ -f "${candidate}/package.json" ]]; then
      echo "${candidate}"
      return 0
    fi
  done
  if [[ -f "${REPO_ROOT}/package.json" ]] && [[ -d "${REPO_ROOT}/src" ]] && [[ ! -d "${REPO_ROOT}/backend" ]]; then
    echo "${REPO_ROOT}"
    return 0
  fi
  return 1
}

detect_backend_dir() {
  for candidate in "${REPO_ROOT}/backend" "${REPO_ROOT}/apps/backend" "${REPO_ROOT}/apps/api"; do
    if [[ -f "${candidate}/package.json" ]]; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}

has_npm_script() {
  local dir="$1"
  local script="$2"
  node -e "
    const pkg = require('${dir}/package.json');
    process.exit(pkg.scripts && pkg.scripts['${script}'] ? 0 : 1);
  " 2>/dev/null
}

write_status_json() {
  local name="$1"
  local status="$2"
  local severity="$3"
  local message="$4"
  python3 - <<PY
import json
from pathlib import Path
path = Path("${AUDIT_META}") / "${name}.status.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({
    "check": "${name}",
    "status": "${status}",
    "severity": "${severity}",
    "message": """${message}""",
}, indent=2), encoding="utf-8")
PY
}

run_npm_script() {
  local dir="$1"
  local script="$2"
  local outfile="$3"
  local status_name="$4"
  local fail_severity="${5:-critical}"

  if ! has_npm_script "${dir}" "${script}"; then
    {
      echo "=== ${status_name} ==="
      echo "STATUS: SKIPPED"
      echo "REASON: npm run ${script} not defined in ${dir}/package.json"
    } > "${outfile}"
    write_status_json "${status_name}" "skipped" "info" "npm run ${script} not defined"
    log_skip "${status_name}: npm run ${script} not available"
    return 0
  fi

  log_info "Running ${status_name} in ${dir}"
  local exit_code=0
  {
    echo "=== ${status_name} ==="
    echo "COMMAND: npm run ${script}"
    echo "WORKDIR: ${dir}"
    echo "--- output ---"
  } > "${outfile}"

  (cd "${dir}" && npm run "${script}") >> "${outfile}" 2>&1 || exit_code=$?

  {
    echo "--- end output ---"
    echo "EXIT_CODE: ${exit_code}"
    if [[ "${exit_code}" -eq 0 ]]; then
      echo "STATUS: PASS"
    else
      echo "STATUS: FAIL"
    fi
  } >> "${outfile}"

  if [[ "${exit_code}" -eq 0 ]]; then
    write_status_json "${status_name}" "pass" "none" "Completed successfully"
  else
    write_status_json "${status_name}" "fail" "${fail_severity}" "Command failed with exit ${exit_code}"
  fi
  return 0
}

grep_count() {
  local pattern="$1"
  local dir="$2"
  shift 2
  grep -RInE "${pattern}" "${dir}" "$@" 2>/dev/null | wc -l | tr -d ' '
}

grep_count_fixed() {
  local pattern="$1"
  local dir="$2"
  shift 2
  grep -RIFn "${pattern}" "${dir}" "$@" 2>/dev/null | wc -l | tr -d ' '
}

grep_sample() {
  local pattern="$1"
  local dir="$2"
  shift 2
  grep -RInE "${pattern}" "${dir}" "$@" 2>/dev/null | head -40 || true
}

grep_sample_fixed() {
  local pattern="$1"
  local dir="$2"
  shift 2
  grep -RIFn "${pattern}" "${dir}" "$@" 2>/dev/null | head -40 || true
}

run_typecheck() {
  local dir="$1"
  local outfile="$2"
  local status_name="$3"

  if has_npm_script "${dir}" "typecheck"; then
    run_npm_script "${dir}" "typecheck" "${outfile}" "${status_name}"
    return 0
  fi

  if [[ -f "${dir}/tsconfig.json" ]] || [[ -f "${dir}/tsconfig.app.json" ]]; then
    log_info "Running ${status_name} via npx tsc --noEmit in ${dir}"
    local exit_code=0
  local tsconfig="tsconfig.json"
  [[ -f "${dir}/tsconfig.app.json" ]] && tsconfig="tsconfig.app.json"
    {
      echo "=== ${status_name} ==="
      echo "COMMAND: npx tsc --noEmit -p ${tsconfig}"
      echo "WORKDIR: ${dir}"
      echo "--- output ---"
    } > "${outfile}"
    (cd "${dir}" && npx tsc --noEmit -p "${tsconfig}") >> "${outfile}" 2>&1 || exit_code=$?
    {
      echo "--- end output ---"
      echo "EXIT_CODE: ${exit_code}"
      if [[ "${exit_code}" -eq 0 ]]; then echo "STATUS: PASS"; else echo "STATUS: FAIL"; fi
    } >> "${outfile}"
    if [[ "${exit_code}" -eq 0 ]]; then
      write_status_json "${status_name}" "pass" "none" "tsc --noEmit passed"
    else
      write_status_json "${status_name}" "fail" "high" "tsc --noEmit failed"
    fi
    return 0
  fi

  {
    echo "=== ${status_name} ==="
    echo "STATUS: SKIPPED"
    echo "REASON: No typecheck script or tsconfig found"
  } > "${outfile}"
  write_status_json "${status_name}" "skipped" "info" "No typecheck available"
  log_skip "${status_name}: no typecheck"
  return 0
}

run_npm_audit_json() {
  local dir="$1"
  local outfile="$2"
  local status_name="$3"

  log_info "Running ${status_name} in ${dir}"
  local exit_code=0
  (cd "${dir}" && npm audit --json > "${outfile}" 2>/dev/null) || exit_code=$?

  if [[ ! -s "${outfile}" ]]; then
    echo '{"error":"npm audit produced no output"}' > "${outfile}"
  fi

  local severity="none"
  local status="pass"
  if [[ "${exit_code}" -ne 0 ]]; then
    status="fail"
    severity="high"
  fi
  write_status_json "${status_name}" "${status}" "${severity}" "npm audit exit ${exit_code}"
  return 0
}

run_optional_tool() {
  local tool_cmd="$1"
  local outfile="$2"
  local status_name="$3"

  log_info "Trying ${status_name}: ${tool_cmd}"
  {
    echo "=== ${status_name} ==="
    echo "COMMAND: ${tool_cmd}"
    echo "--- output ---"
  } > "${outfile}"

  local exit_code=0
  if command -v timeout >/dev/null 2>&1; then
    timeout 180 bash -lc "${tool_cmd}" >> "${outfile}" 2>&1 || exit_code=$?
  else
    eval "${tool_cmd}" >> "${outfile}" 2>&1 || exit_code=$?
  fi

  if [[ "${exit_code}" -eq 0 ]]; then
    echo "STATUS: PASS" >> "${outfile}"
    write_status_json "${status_name}" "pass" "none" "Tool completed"
  else
    if grep -qi "not found\|ENOENT\|could not determine executable\|timed out" "${outfile}" 2>/dev/null; then
      echo "STATUS: NOT_INSTALLED" >> "${outfile}"
      write_status_json "${status_name}" "not_installed" "info" "Tool not available or timed out"
    else
      echo "STATUS: FAIL" >> "${outfile}"
      echo "EXIT_CODE: ${exit_code}" >> "${outfile}"
      write_status_json "${status_name}" "fail" "medium" "Tool reported issues or failed"
    fi
  fi
  return 0
}

mask_value() {
  local value="$1"
  local len=${#value}
  if [[ "${len}" -le 4 ]]; then
    echo "****"
    return
  fi
  echo "${value:0:4}...${value: -4} (masked)"
}
