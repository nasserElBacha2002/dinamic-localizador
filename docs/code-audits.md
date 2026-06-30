# Code Audits

Diagnostic audits inform; strict mode blocks.

## Modes

| Command | Mode | Exit code | Purpose |
|---------|------|-----------|---------|
| `npm run audit` | diagnostic | always `0` | Full evidence + summary |
| `npm run audit:strict` | quality gate | `1` if blocking | Same audit, then enforce gate |
| `npm run audit:summary` | — | `0` | Regenerate summary from `audit/raw/` |
| `npm run audit:baseline` | — | `0` | Save current status as baseline |
| `npm run audit:security:fast` | — | `0` | Fast secrets scan only |
| `npm run audit:security:deep` | — | `0` | Optional deeper scan (manual) |

## Outputs

| Path | Purpose |
|------|---------|
| `audit/audit-summary.md` | Actionable human report |
| `audit/audit-status.json` | Machine-readable checks with `failure_type`, `root_cause`, `action_hint` |
| `audit/audit-diff.md` | Diff vs baseline (if baseline exists) |
| `audit/baseline/audit-status.baseline.json` | Confirmed baseline snapshot |
| `audit/raw/` | Raw evidence per check |

## Check metadata

Each check in `audit-status.json` may include:

- `failure_type`: `test_failure`, `environment_failure`, `dependency_vulnerability`, `architecture_issue`, `security_issue`, `config_missing`, `tool_failure`, `unknown`
- `root_cause`: short explanation from logs
- `evidence_file`: path under `audit/raw/`
- `action_hint`: suggested next step
- `blocking`: whether `audit:strict` should fail on this check

Environment-dependent failures (sandbox EPERM, network) are **not** treated as blocking in strict mode.

## Strict gate blocks on

- Real test failures (`blocking: true`)
- Build / typecheck failures (non-environment)
- Hardcoded secrets
- npm audit **high** or **critical** vulnerabilities

Does **not** block on:

- Environment-only test failures
- Skipped scripts (`config_missing`)
- Architecture heuristics (unless later enabled)

## Baseline workflow

```bash
npm run audit
# review audit-summary.md
npm run audit:baseline   # after confirming acceptable state
npm run audit            # later runs produce audit-diff.md
```

## npm audit guidance

Reports include per-severity counts and top packages. The audit **never** runs `npm audit fix --force`. Prefer:

```bash
npm audit fix
```

Review lockfile changes; use `--force` only after manual major-upgrade validation.

## Security scan performance

Default (`audit:security:fast` / full audit):

- Scans only `backend/src` and `frontend/src`
- Excludes `.env` and `*.test.ts`
- Single grep pass (~1–2s)

`audit:security:deep` is optional/manual and may use `gitleaks` if installed.
