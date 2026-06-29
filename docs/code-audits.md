# Code Audits

This project includes a **local audit layer** (evidence + heuristics) and a **CI quality gate** (blocking checks).

## Local audit (Phase 1 — non-blocking by default)

Run the full audit from the repository root:

```bash
npm run audit
```

Equivalent:

```bash
bash scripts/audit/run_full_audit.sh
```

### What it does

1. Detects `frontend/` and `backend/` automatically.
2. Runs functional checks when scripts exist (lint, typecheck, test, build, `npm audit`).
3. Runs architecture and security heuristics (grep-based + optional `npx madge`, `jscpd`, `ts-prune`).
4. Writes raw evidence to `audit/raw/`.
5. Snapshots each run to `audit/raw/runs/<YYYYMMDD-HHMMSS>/`.
6. Generates:
   - `audit/audit-summary.md`
   - `audit/audit-status.json`
   - `audit/raw/LATEST_RUN.txt`

Local mode **does not fail** by default, even when findings exist.

### Strict mode

Use strict mode before tightening CI rules or before release:

```bash
npm run audit:strict
```

This runs the full audit and then:

```bash
python3 scripts/audit/enforce_quality_gate.py --strict
```

Strict mode fails (`exit 1`) on critical issues such as:

- failed tests or builds
- failed typecheck
- `max_severity=critical` (e.g. hardcoded secrets, critical npm audit)
- `overall_status=error`

### Regenerate summary only

```bash
npm run audit:summary
```

## CI quality gate

Workflow: `.github/workflows/quality-gate.yml`

Blocking in CI:

- backend: typecheck (`npm run build`), tests, `npm audit --audit-level=high`
- frontend: lint, build, tests, `npm audit --audit-level=high`
- strict gate evaluation from `audit/audit-status.json`

Non-blocking in CI (artifact only):

- architecture heuristics (large files, duplication, circular imports)
- domain-rule heuristics
- most low/medium findings

Audit artifacts are uploaded as `audit-report` for each workflow run.

## Where to look

| Path | Purpose |
|------|---------|
| `audit/audit-summary.md` | Human-readable rollup |
| `audit/audit-status.json` | Machine-readable status + severities |
| `audit/raw/` | Latest raw evidence per tool/check |
| `audit/raw/runs/` | Historical snapshots per run |
| `audit/raw/_meta/` | Per-check status JSON used by the summary |

## Severity model

| Severity | Meaning |
|----------|---------|
| `none` | Check passed |
| `info` | Skipped, not installed, or informational |
| `low` | Minor maintainability findings |
| `medium` | Notable quality/architecture debt |
| `high` | Important failures (typecheck, high vulns) |
| `critical` | Must fix (tests/build/secrets/critical vulns) |

## What blocks vs documents

| Check | Local default | CI strict |
|-------|---------------|-----------|
| lint | documents | blocks (frontend) |
| typecheck/build | documents | blocks |
| tests | documents | blocks |
| npm audit high/critical | documents | blocks |
| hardcoded secrets | documents | blocks in strict gate |
| architecture heuristics | documents | does not block |
| domain heuristics | documents | does not block |

## Adding new rules

1. Add or extend a script under `scripts/audit/`.
2. Write evidence to `audit/raw/<name>.*`.
3. Optionally call `write_status_json` from `scripts/audit/lib.sh`.
4. Teach `scripts/audit/generate_audit_summary.py` how to parse severity.
5. If the rule should block, add it to `scripts/audit/enforce_quality_gate.py`.

## Phase 2 recommendations

After the first `audit-summary.md` baseline:

1. Enable backend lint (ESLint) and wire it into `run_backend_audit.sh`.
2. Add dedicated `typecheck` scripts in frontend/backend package.json.
3. Tighten `enforce_quality_gate.py` for medium findings (duplication, circular imports).
4. Pin optional tools (`madge`, `jscpd`, `ts-prune`) as devDependencies for deterministic CI.
5. Add allowlists for known false positives in secrets/domain heuristics.
