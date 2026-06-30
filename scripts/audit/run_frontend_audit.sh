#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

GREP_TS=(--include='*.ts' --include='*.tsx')
GREP_TSX=(--include='*.tsx')

if ! FRONTEND_DIR="$(detect_frontend_dir)"; then
  log_warn "Frontend directory not detected"
  write_status_json "frontend-detected" "skipped" "info" "Frontend package not found"
  exit 0
fi

log_info "Frontend directory: ${FRONTEND_DIR}"

run_npm_script "${FRONTEND_DIR}" "lint" "${AUDIT_RAW}/frontend-eslint.txt" "frontend-eslint" "medium"
run_typecheck "${FRONTEND_DIR}" "${AUDIT_RAW}/frontend-typecheck.txt" "frontend-typecheck"
run_npm_script "${FRONTEND_DIR}" "test" "${AUDIT_RAW}/frontend-test.txt" "frontend-test" "critical"
run_npm_script "${FRONTEND_DIR}" "build" "${AUDIT_RAW}/frontend-build.txt" "frontend-build" "critical"
run_npm_audit_json "${FRONTEND_DIR}" "${AUDIT_RAW}/frontend-npm-audit.json" "frontend-npm-audit"

SRC_DIR="${FRONTEND_DIR}/src"
USEFFECT_OUT="${AUDIT_RAW}/frontend-useeffects-audit.md"
ERR_OUT="${AUDIT_RAW}/frontend-error-handling-audit.md"
REUSE_OUT="${AUDIT_RAW}/frontend-reusable-components-audit.md"

{
  echo "# Frontend useEffect audit"
  echo
  if [[ ! -d "${SRC_DIR}" ]]; then
    echo "STATUS: SKIPPED — src directory not found"
  else
    total=$(grep_count_fixed 'useEffect(' "${SRC_DIR}" "${GREP_TS[@]}")
    empty_deps=$(grep_count_fixed ', []' "${SRC_DIR}" "${GREP_TS[@]}")
    side_effects=0
    while IFS= read -r -d '' file; do
      if grep -qF 'useEffect(' "${file}" && grep -qE 'fetch\(|axios\.|setInterval|setTimeout|addEventListener' "${file}"; then
        side_effects=$((side_effects + 1))
      fi
    done < <(find "${SRC_DIR}" \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 2>/dev/null)
    echo "- Total useEffect occurrences: ${total}"
    echo "- Effects with empty dependency array: ${empty_deps}"
    echo "- Files with useEffect + fetch/axios/timers/listeners (heuristic): ${side_effects}"
    echo
    echo "## Findings"
    echo "- Review effects with side effects; prefer React Query or custom hooks for data fetching."
    grep_sample_fixed 'useEffect(' "${SRC_DIR}" "${GREP_TS[@]}"
  fi
} > "${USEFFECT_OUT}"

{
  echo "# Frontend error handling audit"
  echo
  if [[ -d "${SRC_DIR}" ]]; then
    empty_catch=$(grep -RIFn 'catch ()' "${SRC_DIR}" "${GREP_TS[@]}" 2>/dev/null | wc -l | tr -d ' ')
    console_only=$(grep -REn 'catch[[:space:]]*\([^)]*\)[[:space:]]*\{[^}]*console\.(error|log)' "${SRC_DIR}" "${GREP_TS[@]}" 2>/dev/null | wc -l | tr -d ' ')
    echo "- Empty catch blocks (heuristic): ${empty_catch}"
    echo "- catch blocks logging only to console (heuristic): ${console_only}"
    echo
    grep_sample_fixed 'catch (' "${SRC_DIR}" "${GREP_TS[@]}" | head -30
  else
    echo "STATUS: SKIPPED"
  fi
} > "${ERR_OUT}"

{
  echo "# Frontend reusable components audit"
  echo
  if [[ -d "${SRC_DIR}" ]]; then
    for token in Button Card Dialog Table Modal Drawer Alert CircularProgress; do
      count=$(grep -REnw "${token}" "${SRC_DIR}" "${GREP_TSX[@]}" 2>/dev/null | wc -l | tr -d ' ')
      echo "- ${token} references: ${count}"
    done
    echo
    echo "## Possible manual UI patterns"
    grep -RInE '<button|role="dialog"|<table' "${SRC_DIR}" "${GREP_TSX[@]}" 2>/dev/null | head -30 || true
  else
    echo "STATUS: SKIPPED"
  fi
} > "${REUSE_OUT}"

write_status_json "frontend-heuristics" "pass" "info" "Heuristic frontend audits generated"
exit 0
