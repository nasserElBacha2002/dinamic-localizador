#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

if ! FRONTEND_DIR="$(detect_frontend_dir)"; then
  log_warn "Frontend directory not detected for architecture audit"
  exit 0
fi

SRC_DIR="${FRONTEND_DIR}/src"
SMELLS="${AUDIT_RAW}/frontend-code-smells.txt"
COMPLEXITY="${AUDIT_RAW}/frontend-complexity.txt"
IMPORTS="${AUDIT_RAW}/frontend-import-boundaries.txt"
DUP="${AUDIT_RAW}/frontend-duplication.txt"
DEAD="${AUDIT_RAW}/frontend-dead-code.txt"
SOLID="${AUDIT_RAW}/frontend-solid-react-audit.md"

{
  echo "=== Frontend large files (>300 lines) ==="
  if [[ -d "${SRC_DIR}" ]]; then
    find "${SRC_DIR}" \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -type f -print0 \
      | while IFS= read -r -d '' file; do
          lines=$(wc -l < "${file}" | tr -d ' ')
          if [[ "${lines}" -gt 300 ]]; then
            echo "${lines} ${file#${REPO_ROOT}/}"
          fi
        done | sort -nr
  else
    echo "STATUS: SKIPPED"
  fi
} > "${SMELLS}"

{
  echo "=== Frontend complexity heuristics ==="
  if [[ -d "${SRC_DIR}" ]]; then
    echo "Files with high branching/nesting indicators:"
    grep -RInE 'if \\(|switch \\(|for \\(|while \\(|\\? .*\\? ' "${SRC_DIR}" --include='*.tsx' --include='*.ts' 2>/dev/null \
      | cut -d: -f1 | sort | uniq -c | sort -nr | head -30
  else
    echo "STATUS: SKIPPED"
  fi
} > "${COMPLEXITY}"

run_optional_tool "cd '${FRONTEND_DIR}' && npx --yes madge --circular --extensions ts,tsx src" "${IMPORTS}" "frontend-circular-imports"
run_optional_tool "cd '${FRONTEND_DIR}' && npx --yes jscpd --min-lines 8 --min-tokens 60 --format 'typescript' --reporters 'console' src" "${DUP}" "frontend-duplication"
run_optional_tool "cd '${FRONTEND_DIR}' && npx --yes ts-prune -p tsconfig.json" "${DEAD}" "frontend-dead-code"

{
  echo "# Frontend SOLID / React architecture audit"
  echo
  echo "## Summary"
  if [[ -d "${SRC_DIR}" ]]; then
    pages=$(find "${SRC_DIR}/pages" -name '*.tsx' 2>/dev/null | wc -l | tr -d ' ')
    hooks=$(find "${SRC_DIR}/hooks" -name '*.ts' -o -name '*.tsx' 2>/dev/null | wc -l | tr -d ' ')
    api=$(find "${SRC_DIR}/api" -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
    echo "- pages/: ${pages} files"
    echo "- hooks/: ${hooks} files"
    echo "- api/: ${api} files"
    echo
    echo "## Possible business logic in UI"
    grep -RInE 'axios\\.|fetch\\(|localStorage|sessionStorage' "${SRC_DIR}/pages" --include='*.tsx' 2>/dev/null | head -25 || true
    echo
    echo "## Large components (review for extraction)"
    find "${SRC_DIR}" -name '*.tsx' -type f -print0 | while IFS= read -r -d '' f; do
      c=$(wc -l < "$f" | tr -d ' ')
      [[ "${c}" -gt 200 ]] && echo "- ${c} lines: ${f#${REPO_ROOT}/}"
    done
  else
    echo "STATUS: SKIPPED"
  fi
} > "${SOLID}"

write_status_json "frontend-architecture" "pass" "info" "Frontend architecture audit generated"
exit 0
