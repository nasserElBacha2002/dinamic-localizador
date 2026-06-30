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
    grep -RInE 'if \\(|switch \\(|for \\(|while \\(' "${SRC_DIR}/controllers" "${SRC_DIR}/routes" 2>/dev/null \
      | cut -d: -f1 | sort | uniq -c | sort -nr | head -20
    echo
    echo "Services with many branches (top files):"
    grep -RInE 'if \\(|switch \\(|for \\(|while \\(' "${SRC_DIR}/services" 2>/dev/null \
      | cut -d: -f1 | sort | uniq -c | sort -nr | head -20
  else
    echo "STATUS: SKIPPED"
  fi
} > "${COMPLEXITY}"

run_optional_tool "cd '${BACKEND_DIR}' && npx --yes madge --circular --extensions ts src" "${IMPORTS}" "backend-circular-imports"
run_optional_tool "cd '${BACKEND_DIR}' && npx --yes jscpd --min-lines 10 --min-tokens 70 --format 'typescript' --reporters 'console' src" "${DUP}" "backend-duplication"
run_optional_tool "cd '${BACKEND_DIR}' && npx --yes ts-prune -p tsconfig.json" "${DEAD}" "backend-dead-code"

{
  echo "# Backend architecture audit"
  echo
  for dir in controllers routes services repositories middleware utils types schemas; do
    if [[ -d "${SRC_DIR}/${dir}" ]]; then
      count=$(find "${SRC_DIR}/${dir}" -type f | wc -l | tr -d ' ')
      echo "- ${dir}/: ${count} files"
    fi
  done
  echo
  echo "## SQL outside repositories (heuristic)"
  grep -RInE 'SELECT |INSERT |UPDATE |DELETE |MERGE ' "${SRC_DIR}" --include='*.ts' \
    | grep -v '/repositories/' | grep -v '.test.ts' | head -30 || echo "None detected"
  echo
  echo "## Frontend imports in backend"
  grep -RIn "from ['\\\"].*frontend" "${SRC_DIR}" --include='*.ts' 2>/dev/null || echo "None detected"
  echo
  echo "## Possible hardcoded secrets"
  grep -RInE 'TWILIO_AUTH_TOKEN|JWT_SECRET|password\\s*=\\s*['\\\"][^'\\\"]+|api[_-]?key\\s*=\\s*['\\\"][^'\\\"]+' "${SRC_DIR}" --include='*.ts' \
    | grep -v '.test.ts' | head -20 || echo "None detected (review manually)"
} > "${ARCH}"

{
  echo "# Backend domain rules audit (heuristic)"
  echo
  check() { echo "- $1: $(grep -RIn "$2" "${SRC_DIR}" --include='*.ts' 2>/dev/null | wc -l | tr -d ' ') matches"; }
  check "Twilio MessageSid idempotency" "findByMessageSid\\|message_sid\\|MessageSid"
  check "Bot session handling" "bot-session\\|botSession\\|WAITING_"
  check "Session expiration" "expires_at\\|SESSION_TTL\\|expire"
  check "Check-in flow" "check-in\\|checkIn\\|isCheckInIntent\\|Llegu"
  check "Check-out flow" "checkout\\|isCheckoutIntent\\|Termin"
  check "Geofencing/Haversine" "haversine\\|geofence\\|distanceMeters"
  check "Timezone usage" "BOT_OPERATION_TIMEZONE\\|timeZone"
  check "Inventory assignment validation" "inventoryEmployee\\|inventory_employees"
  check "Inventory time window" "scheduled_start\\|tolerance_minutes\\|isWithinInventoryWindow"
  check "Parameterized queries" "@\\w+"
  check "Reminder deduplication" "claimNotificationForAttempt\\|whatsapp_attendance_notifications"
  echo
  echo "## Migrations"
  find "${REPO_ROOT}/database/migrations" -name '*.sql' 2>/dev/null | sort || echo "No migrations directory"
  echo
  echo "## Logging sensitive data (review)"
  grep -RInE 'console\\.(log|info|debug).*phone|auth_token|password' "${SRC_DIR}" --include='*.ts' 2>/dev/null | head -15 || echo "None obvious"
} > "${DOMAIN}"

write_status_json "backend-architecture" "pass" "info" "Backend architecture audit generated"
write_status_json "backend-domain-rules" "pass" "info" "Domain rules heuristic audit generated"
exit 0
