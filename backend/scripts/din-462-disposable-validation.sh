#!/usr/bin/env bash
# DIN-462 disposable SQL closure checks (read-only on persistent control DB; disposable SQL only).
#
# Required env (no insecure defaults for destructive ack / server identity):
#   TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true
#   TEST_SQL_ALLOWED_SERVER_NAME=<matches @@SERVERNAME on disposable instance>
#   TEST_DB_HOST, TEST_DB_PORT, TEST_DB_USER, TEST_DB_PASSWORD
#   TEST_SQL_ALLOW_SYSTEM_ADMIN=true  (only when TEST_DB_USER=sa)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$(cd "$ROOT/../audit" && pwd)"
LOG="$AUDIT/DIN-462-closure-tap.txt"
GATE="$ROOT/scripts/din-462-closure-gate.mjs"
RESULTS="$AUDIT/DIN-462-validation-results.txt"
: >"$LOG"
: >"$RESULTS"

FAILURES=0
SCRIPT_ORCHESTRATOR_PIDS=()
INVENTORY_OK=true
FINAL_EXIT=0

export TEST_DB_HOST="${TEST_DB_HOST:-localhost}"
export TEST_DB_PORT="${TEST_DB_PORT:-14333}"
export TEST_DB_USER="${TEST_DB_USER:-sa}"
export TEST_DB_PASSWORD="${TEST_DB_PASSWORD:-TestPassword123!}"
export TEST_DB_ENCRYPT="${TEST_DB_ENCRYPT:-false}"
export TEST_DB_TRUST_SERVER_CERTIFICATE="${TEST_DB_TRUST_SERVER_CERTIFICATE:-true}"
export JWT_SECRET="${JWT_SECRET:-ci-jwt-secret-min-16-chars}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
export TZ="${TZ:-America/Argentina/Buenos_Aires}"
export EMAIL_TRANSPORT="${EMAIL_TRANSPORT:-console}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@dinamicsystems.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-ci-test-password-123}"
export ADMIN_NAME="${ADMIN_NAME:-CI Platform Admin}"
export INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED="${INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED:-true}"

CONTROL_DB="${DIN462_CONTROL_PERSISTENT_DB_NAME:-din462_control_persistent}"
SNAPSHOT="$AUDIT/DIN-462-control-persistent-snapshot.json"
export PERSISTENT_DB_VERIFY_HOST="$TEST_DB_HOST"
export PERSISTENT_DB_VERIFY_PORT="$TEST_DB_PORT"
export PERSISTENT_DB_VERIFY_USER="$TEST_DB_USER"
export PERSISTENT_DB_VERIFY_PASSWORD="$TEST_DB_PASSWORD"
export PERSISTENT_DB_VERIFY_NAME="$CONTROL_DB"
export PERSISTENT_DB_INTEGRITY_SNAPSHOT_PATH="$SNAPSHOT"

record_pass() {
  local msg="$1"
  echo "PASS: $msg" | tee -a "$LOG" "$RESULTS"
}

record_fail() {
  local msg="$1"
  echo "FAIL: $msg" | tee -a "$LOG" "$RESULTS"
  FAILURES=$((FAILURES + 1))
}

gate_exit() {
  local label="$1"
  local code="$2"
  local expect_zero="${3:-true}"
  local verdict
  verdict=$(node --input-type=module -e "
    import { evaluateExitCode } from '${GATE}';
    const r = evaluateExitCode(Number(process.argv[1]), process.argv[2] === 'true');
    console.log(r.ok ? 'PASS' : 'FAIL|' + r.message);
  " "$code" "$expect_zero")
  if [[ "$verdict" == PASS ]]; then
    record_pass "$label (exit=$code)"
    return 0
  fi
  record_fail "$label — ${verdict#FAIL|}"
  return 1
}

gate_tap() {
  local label="$1"
  local file="$2"
  local verdict
  verdict=$(node --input-type=module -e "
    import fs from 'node:fs';
    import { parseTapSummaryLine, evaluateTapStrict } from '${GATE}';
    const text = fs.readFileSync(process.argv[1], 'utf8');
    const summary = parseTapSummaryLine(text);
    const r = evaluateTapStrict(summary);
    console.log(r.ok ? 'PASS' : 'FAIL|' + r.message);
  " "$file")
  if [[ "$verdict" == PASS ]]; then
    record_pass "$label TAP"
    grep -E '^# (tests|pass|fail|skipped|cancelled) ' "$file" | tee -a "$LOG" || true
    return 0
  fi
  record_fail "$label TAP — ${verdict#FAIL|}"
  grep -E '^# (tests|pass|fail|skipped|cancelled) ' "$file" | tee -a "$LOG" || true
  return 1
}

register_orchestrator_pid() {
  local pid="$1"
  SCRIPT_ORCHESTRATOR_PIDS+=("$pid")
}

unregister_orchestrator_pid() {
  local pid="$1"
  local kept=()
  local p
  for p in "${SCRIPT_ORCHESTRATOR_PIDS[@]}"; do
    [[ "$p" == "$pid" ]] || kept+=("$p")
  done
  if [[ ${#kept[@]} -eq 0 ]]; then
    SCRIPT_ORCHESTRATOR_PIDS=()
  else
    SCRIPT_ORCHESTRATOR_PIDS=("${kept[@]}")
  fi
}

teardown_orchestrator_pid() {
  local pid="$1"
  local label="$2"
  export DINAMIC_INTEGRATION_ORCHESTRATOR_PID="$pid"
  set +e
  npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/teardown-integration-database.ts >>"$LOG" 2>&1
  local te=$?
  set -e
  if ! gate_exit "$label" "$te" true; then
    return 1
  fi
  unregister_orchestrator_pid "$pid"
  return 0
}

cleanup_registered_sessions() {
  if [[ ${#SCRIPT_ORCHESTRATOR_PIDS[@]} -eq 0 ]]; then
    return 0
  fi
  local pid
  for pid in "${SCRIPT_ORCHESTRATOR_PIDS[@]}"; do
    local session="${TMPDIR:-/tmp}/dinamic-integration-db-${pid}.json"
    if [[ ! -f "$session" ]]; then
      continue
    fi
    echo "--- trap cleanup orchestrator pid=$pid ---" | tee -a "$LOG"
    set +e
    export DINAMIC_INTEGRATION_ORCHESTRATOR_PID="$pid"
    npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/teardown-integration-database.ts >>"$LOG" 2>&1
    local te=$?
    set -e
    if [[ "$te" -ne 0 ]]; then
      record_fail "trap teardown pid=$pid exit=$te"
    else
      echo "PASS: trap teardown pid=$pid (exit=0)" | tee -a "$LOG" "$RESULTS"
    fi
  done
  SCRIPT_ORCHESTRATOR_PIDS=()
}

on_signal() {
  echo "=== DIN-462 validation interrupted ===" | tee -a "$LOG" "$RESULTS"
  FINAL_EXIT=130
}

on_exit() {
  local ec="${FINAL_EXIT:-$?}"
  cleanup_registered_sessions
  if [[ "$FAILURES" -gt 0 ]]; then
    ec=1
  fi
  echo "=== closure gate failures=$FAILURES exit=$ec ===" | tee -a "$LOG" "$RESULTS"
  if [[ "$FAILURES" -gt 0 || "$ec" -ne 0 ]]; then
    echo "FINAL: FAIL ($FAILURES mandatory checks failed)" | tee -a "$LOG" "$RESULTS"
    exit 1
  fi
  echo "FINAL: PASS (all mandatory DIN-462 checks passed)" | tee -a "$LOG" "$RESULTS"
  exit 0
}

trap on_signal INT TERM
trap on_exit EXIT

capture_mandatory_inventory() {
  local dest="$1"
  local label="$2"
  set +e
  npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/list-ephemeral-sql-databases.ts >"$dest" 2>>"$LOG"
  local code=$?
  set -e
  sort -u -o "$dest" "$dest" || true
  local verdict
  verdict=$(node --input-type=module -e "
    import { evaluateInventoryListExit } from '${GATE}';
    const r = evaluateInventoryListExit(Number(process.argv[1]));
    console.log(r.ok ? 'PASS' : 'FAIL|' + r.message);
  " "$code")
  if [[ "$verdict" == PASS ]]; then
    record_pass "$label (exit=$code)"
    return 0
  fi
  record_fail "$label — ${verdict#FAIL|}"
  INVENTORY_OK=false
  return 1
}

require_disposable_env() {
  local verdict
  verdict=$(node --input-type=module -e "
    import { evaluateDisposableValidationEnv } from '${GATE}';
    const r = evaluateDisposableValidationEnv({
      TEST_SQL_DISPOSABLE_ACKNOWLEDGED: process.env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED,
      TEST_SQL_ALLOWED_SERVER_NAME: process.env.TEST_SQL_ALLOWED_SERVER_NAME,
      TEST_SQL_ALLOW_SYSTEM_ADMIN: process.env.TEST_SQL_ALLOW_SYSTEM_ADMIN,
      TEST_DB_HOST: process.env.TEST_DB_HOST,
      TEST_DB_USER: process.env.TEST_DB_USER,
      TEST_DB_PASSWORD: process.env.TEST_DB_PASSWORD,
    });
    console.log(r.ok ? 'PASS' : 'FAIL|' + r.message);
  ")
  if [[ "$verdict" == PASS ]]; then
    record_pass "explicit disposable SQL env"
    return 0
  fi
  record_fail "disposable SQL env — ${verdict#FAIL|}"
  echo "Set TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true, TEST_SQL_ALLOWED_SERVER_NAME=<@@SERVERNAME>, and TEST_SQL_ALLOW_SYSTEM_ADMIN=true for sa." | tee -a "$LOG" "$RESULTS"
  FINAL_EXIT=1
  exit 1
}

inventory_before_file="$(mktemp)"
inventory_after_file="$(mktemp)"

cd "$ROOT"
echo "=== DIN-462 closure validation $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$LOG" "$RESULTS"

require_disposable_env

echo "--- verify disposable SQL server identity ---" | tee -a "$LOG"
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/verify-disposable-sql-server-identity.ts 2>&1 | tee -a "$LOG"
IDENTITY_EXIT=$?
set -e
if ! gate_exit "verify @@SERVERNAME matches TEST_SQL_ALLOWED_SERVER_NAME" "$IDENTITY_EXIT" true; then
  FINAL_EXIT=1
  exit 1
fi

echo "--- ephemeral inventory (before) ---" | tee -a "$LOG"
if ! capture_mandatory_inventory "$inventory_before_file" "ephemeral inventory (before)"; then
  FINAL_EXIT=1
  exit 1
fi
tee -a "$LOG" <"$inventory_before_file"

echo "--- ensure control persistent DB seeded ---" | tee -a "$LOG"
if ! npx tsx --import ./src/test-helpers/integration-strip-db-env.ts scripts/din-462-seed-control-persistent-db.ts >>"$LOG" 2>&1; then
  record_fail "seed control persistent database"
fi

echo "--- persistent integrity capture (before integration) ---" | tee -a "$LOG"
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/verify-persistent-database-integrity.ts capture >>"$LOG" 2>&1
CAP_BEFORE=$?
set -e
gate_exit "persistent capture (before)" "$CAP_BEFORE" true

echo "--- npm run build ---" | tee -a "$LOG"
set +e
npm run build >>"$LOG" 2>&1
BUILD_EXIT=$?
set -e
gate_exit "npm run build" "$BUILD_EXIT" true

echo "--- npm test ---" | tee -a "$LOG"
UNIT_OUT=$(mktemp)
set +e
npm test 2>&1 | tee "$UNIT_OUT"
UNIT_EXIT=${PIPESTATUS[0]}
set -e
gate_exit "npm test" "$UNIT_EXIT" true || true
gate_tap "npm test" "$UNIT_OUT" || true
rm -f "$UNIT_OUT"

echo "--- lifecycle 5 tests ---" | tee -a "$LOG"
LIFE_OUT=$(mktemp)
export RUN_DB_INTEGRATION_TESTS=true INTEGRATION_SQL_DDL_ALLOWED=true
export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=$$
register_orchestrator_pid "$$"
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/provision-integration-database.ts >>"$LOG" 2>&1
PROV_LIFE=$?
set -e
if [[ "$PROV_LIFE" -ne 0 ]]; then
  record_fail "lifecycle provision exit=$PROV_LIFE"
  unregister_orchestrator_pid "$$"
else
  SESSION=$(ls -t "${TMPDIR:-/tmp}"/dinamic-integration-db-*.json 2>/dev/null | head -1)
  DBNAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).databaseName)" "$SESSION")
  export DINAMIC_TEST_SQL_ACTIVE=true DINAMIC_INTEGRATION_DATABASE_NAME="$DBNAME"
  export DB_HOST="$TEST_DB_HOST" DB_PORT="$TEST_DB_PORT" DB_USER="$TEST_DB_USER" DB_PASSWORD="$TEST_DB_PASSWORD" DB_NAME="$DBNAME"
  set +e
  npx tsx --import ./src/test-helpers/integration-strip-db-env.ts --import ./src/test-helpers/preload-test-env.ts --test \
    src/test-helpers/din-462-ephemeral-database.lifecycle.integration.test.ts 2>&1 | tee "$LIFE_OUT"
  LIFE_EXIT=${PIPESTATUS[0]}
  set -e
  gate_exit "lifecycle integration tests" "$LIFE_EXIT" true || true
  gate_tap "lifecycle integration tests" "$LIFE_OUT" || true
  export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=$$
  teardown_orchestrator_pid "$$" "lifecycle teardown" || true
fi
rm -f "$LIFE_OUT"

echo "--- billing ephemeral lifecycle test ---" | tee -a "$LOG"
BILL_OUT=$(mktemp)
export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=$$
register_orchestrator_pid "$$"
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/provision-integration-database.ts >>"$LOG" 2>&1
PROV_BILL=$?
set -e
if [[ "$PROV_BILL" -ne 0 ]]; then
  record_fail "billing test provision exit=$PROV_BILL"
  unregister_orchestrator_pid "$$"
else
  SESSION=$(ls -t "${TMPDIR:-/tmp}"/dinamic-integration-db-*.json 2>/dev/null | head -1)
  DBNAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).databaseName)" "$SESSION")
  export DINAMIC_TEST_SQL_ACTIVE=true DINAMIC_INTEGRATION_DATABASE_NAME="$DBNAME"
  export DB_HOST="$TEST_DB_HOST" DB_PORT="$TEST_DB_PORT" DB_USER="$TEST_DB_USER" DB_PASSWORD="$TEST_DB_PASSWORD" DB_NAME="$DBNAME"
  set +e
  npx tsx --import ./src/test-helpers/integration-strip-db-env.ts --import ./src/test-helpers/preload-test-env.ts --test \
    src/test-helpers/ephemeral-billing-exemption-database.integration.test.ts 2>&1 | tee "$BILL_OUT"
  BILL_EXIT=${PIPESTATUS[0]}
  set -e
  gate_exit "billing ephemeral integration test" "$BILL_EXIT" true || true
  gate_tap "billing ephemeral integration test" "$BILL_OUT" || true
  export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=$$
  teardown_orchestrator_pid "$$" "billing test teardown" || true
fi
rm -f "$BILL_OUT"

echo "--- concurrent provision (2) ---" | tee -a "$LOG"
CONC_INV_BEFORE=$(mktemp)
capture_mandatory_inventory "$CONC_INV_BEFORE" "ephemeral inventory (before concurrent)"
register_orchestrator_pid 880001
register_orchestrator_pid 880002
export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=880001
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/provision-integration-database.ts >>"$LOG" 2>&1 &
P1=$!
export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=880002
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/provision-integration-database.ts >>"$LOG" 2>&1 &
P2=$!
wait "$P1"; E1=$?
wait "$P2"; E2=$?
set -e
gate_exit "concurrent provision #1" "$E1" true
gate_exit "concurrent provision #2" "$E2" true
for PID in 880001 880002; do
  teardown_orchestrator_pid "$PID" "concurrent teardown pid=$PID"
done
CONC_INV_AFTER=$(mktemp)
if capture_mandatory_inventory "$CONC_INV_AFTER" "ephemeral inventory (after concurrent)"; then
  CONC_INV_VERDICT=$(node --input-type=module -e "
    import fs from 'node:fs';
    import { diffNewDatabaseNames, evaluateNoNewEphemeralLeaks } from '${GATE}';
    const before = fs.readFileSync('${CONC_INV_BEFORE}', 'utf8').trim().split('\n').filter(Boolean);
    const after = fs.readFileSync('${CONC_INV_AFTER}', 'utf8').trim().split('\n').filter(Boolean);
    const r = evaluateNoNewEphemeralLeaks(diffNewDatabaseNames(before, after));
    console.log(r.ok ? 'PASS' : 'FAIL|' + r.message);
  ")
  if [[ "$CONC_INV_VERDICT" == PASS ]]; then
    record_pass "concurrent provision ephemeral inventory"
  else
    record_fail "concurrent provision ephemeral inventory — ${CONC_INV_VERDICT#FAIL|}"
  fi
fi
rm -f "$CONC_INV_BEFORE" "$CONC_INV_AFTER"

echo "--- provision failure (missing ack) ---" | tee -a "$LOG"
set +e
env -u TEST_SQL_DISPOSABLE_ACKNOWLEDGED npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/provision-integration-database.ts >>"$LOG" 2>&1
PROV_FAIL=$?
set -e
gate_exit "provision without disposable ack (expect reject)" "$PROV_FAIL" false

echo "--- teardown failure (wrong orchestrator) ---" | tee -a "$LOG"
export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=$$
register_orchestrator_pid "$$"
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/provision-integration-database.ts >>"$LOG" 2>&1
PROV_GUARD=$?
set -e
if [[ "$PROV_GUARD" -ne 0 ]]; then
  record_fail "teardown-guard provision exit=$PROV_GUARD"
  unregister_orchestrator_pid "$$"
else
  export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=999999
  set +e
  npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/teardown-integration-database.ts >>"$LOG" 2>&1
  TEAR_FAIL=$?
  set -e
  gate_exit "teardown wrong orchestrator (expect reject)" "$TEAR_FAIL" false
  export DINAMIC_INTEGRATION_ORCHESTRATOR_PID=$$
  teardown_orchestrator_pid "$$" "teardown wrong-orchestrator cleanup"
fi

echo "--- orphan recovery dry-run ---" | tee -a "$LOG"
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/recover-orphan-test-databases.ts 2>&1 | tee -a "$LOG"
ORPHAN_EXIT=$?
set -e
gate_exit "orphan recovery dry-run" "$ORPHAN_EXIT" true

RUN_INV_BEFORE=$(mktemp)
capture_mandatory_inventory "$RUN_INV_BEFORE" "ephemeral inventory (before full integration)"

echo "--- full integration (npm run test:integration) ---" | tee -a "$LOG"
INT_OUT="$AUDIT/DIN-462-full-integration-tap.log"
set +e
npm run test:integration 2>&1 | tee "$INT_OUT"
INT_EXIT=${PIPESTATUS[0]}
set -e
gate_exit "npm run test:integration" "$INT_EXIT" true || true
gate_tap "npm run test:integration" "$INT_OUT" || true
grep -E 'integration_files=|tap summary' "$INT_OUT" | tee -a "$LOG" || true

echo "--- persistent integrity compare (after integration) ---" | tee -a "$LOG"
set +e
npx tsx --import ./src/test-helpers/integration-strip-db-env.ts src/scripts/verify-persistent-database-integrity.ts compare >>"$LOG" 2>&1
CAP_AFTER=$?
set -e
gate_exit "persistent compare (after)" "$CAP_AFTER" true

echo "--- ephemeral inventory (after) ---" | tee -a "$LOG"
if capture_mandatory_inventory "$inventory_after_file" "ephemeral inventory (after)"; then
  tee -a "$LOG" <"$inventory_after_file"
  INV_REPORT=$(node --input-type=module -e "
    import fs from 'node:fs';
    import { diffNewDatabaseNames, evaluateNoNewEphemeralLeaks } from '${GATE}';
    const beforeRun = fs.readFileSync('${RUN_INV_BEFORE}', 'utf8').trim().split('\n').filter(Boolean);
    const afterAll = fs.readFileSync('${inventory_after_file}', 'utf8').trim().split('\n').filter(Boolean);
    const baseline = fs.readFileSync('${inventory_before_file}', 'utf8').trim().split('\n').filter(Boolean);
    const newFromRun = diffNewDatabaseNames(beforeRun, afterAll);
    const r = evaluateNoNewEphemeralLeaks(newFromRun);
    console.log('new_from_this_run=' + (newFromRun.length ? newFromRun.join(',') : '(none)'));
    console.log('historical_at_start=' + (baseline.length ? baseline.join(',') : '(none)'));
    console.log(r.ok ? 'INV_PASS' : 'INV_FAIL|' + r.message);
  ")
  echo "$INV_REPORT" | tee -a "$LOG" "$RESULTS"
  if echo "$INV_REPORT" | grep -q '^INV_PASS$'; then
    record_pass "no new ephemeral DBs leaked by this validation run"
  elif echo "$INV_REPORT" | grep -q '^INV_FAIL|'; then
    LEAK_MSG=$(echo "$INV_REPORT" | grep '^INV_FAIL|' | head -1)
    record_fail "ephemeral leak check — ${LEAK_MSG#INV_FAIL|}"
  fi
fi

rm -f "$inventory_before_file" "$inventory_after_file" "$RUN_INV_BEFORE"

# on_exit trap prints FINAL and exit code