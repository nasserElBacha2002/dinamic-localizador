# Audit framework corrections — validation

## Commands executed

| Command | Result |
|---|---|
| `npm run test:audit-framework` | PASS (24 tests) |
| `npm run audit:security:fast` | PASS (secrets=0) |
| `npm run audit` | PASS — run_id `20260812-142901`, framework ok, diagnostic gate clean |
| `npm run audit:strict` | PASS — run_id `20260812-143347`, `QUALITY GATE PASSED` (fail-closed integrity ok) |

## Fault injection (controlled; artifacts restored / overwritten by full audit)

| Case | Expected | Result |
|---|---|---|
| Framework failure + stale findings | strict FAIL | OK |
| Corrupt findings.json | strict FAIL | OK |
| Wrong run_id | strict FAIL | OK |
| Partial solid scan | canonical findings untouched | OK |
| Baseline from partial | exit 1 / NOT saved | OK |

## Integrity checks after strict

- `current-run.json.run_id` == `findings.json.run_id`
- `findings.json.run_type == full` && `completed == true`
- `audit:solid` / `audit:grasp` write only under `audit/raw/partial/`
- Official `npm run audit:baseline` **not** executed against production findings (per phase requirement)

## Notes

- `audit:dead-code` / `audit:env` → ENV/npm inventory only (partial coverage documented in report)
- Finding hotspot score ≠ change-risk score
- Control-flow token density ≠ cyclomatic complexity
