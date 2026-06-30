#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

if ! BACKEND_DIR="$(detect_backend_dir)"; then
  log_warn "Backend directory not detected for architecture audit"
  exit 0
fi

SRC_DIR="${BACKEND_DIR}/src"
SMELLS="${AUDIT_RAW}/backend-code-smells.txt"
COMPLEXITY="${AUDIT_RAW}/backend-complexity.txt"
IMPORTS="${AUDIT_RAW}/backend-import-boundaries.txt"
DUP="${AUDIT_RAW}/backend-duplication.txt"
DEAD="${AUDIT_RAW}/backend-dead-code.txt"
ARCH="${AUDIT_RAW}/backend-architecture-audit.md"
DOMAIN="${AUDIT_RAW}/backend-domain-rules-audit.md"

{
  echo "=== Backend large files (>300 lines) ==="
  if [[ -d "${SRC_DIR}" ]]; then
    find "${SRC_DIR}" \( -name '*.ts' -o -name '*.js' \) -type f -print0 \
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
  echo "=== Backend complexity heuristics ==="
  if [[ -d "${SRC_DIR}" ]]; then
    echo "Controllers/routes with many branches (top files):"
    grep -RInE 'if \(|switch \(|for \(|while \(' "${SRC_DIR}/controllers" "${SRC_DIR}/routes" 2>/dev/null \
      | cut -d: -f1 | sort | uniq -c | sort -nr | head -20
    echo
    echo "Services with many branches (top files):"
    grep -RInE 'if \(|switch \(|for \(|while \(' "${SRC_DIR}/services" 2>/dev/null \
      | cut -d: -f1 | sort | uniq -c | sort -nr | head -20
  else
    echo "STATUS: SKIPPED"
  fi
} > "${COMPLEXITY}"

run_optional_tool "cd '${BACKEND_DIR}' && npx --yes madge --circular --extensions ts src" "${IMPORTS}" "backend-circular-imports"
run_optional_tool "cd '${BACKEND_DIR}' && npx --yes jscpd --min-lines 10 --min-tokens 70 --format 'typescript' --reporters 'console' src" "${DUP}" "backend-duplication"
run_optional_tool "cd '${BACKEND_DIR}' && npx --yes ts-prune -p tsconfig.json" "${DEAD}" "backend-dead-code"

python3 "${SCRIPT_DIR}/audit_sql_analysis.py" "${DOMAIN}" "${ARCH}"

{
  echo
  echo "## Frontend imports in backend"
  grep -RIn "from ['\"].*frontend" "${SRC_DIR}" --include='*.ts' 2>/dev/null || echo "None detected"
} >> "${ARCH}"

write_status_json "backend-architecture" "pass" "info" "Backend architecture audit generated"
write_status_json "backend-domain-rules" "pass" "info" "Domain rules heuristic audit generated"
exit 0
