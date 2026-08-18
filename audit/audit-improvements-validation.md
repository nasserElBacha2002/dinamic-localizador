# Audit framework improvements — validation

## Commands validated

| Command | Result |
|---|---|
| `python3 -m unittest discover -s scripts/audit/framework/tests -p 'test_*.py'` | PASS (8 tests) |
| `python3 scripts/audit/run_framework_audit.py --print-summary` | PASS — findings generated, gate passed (blocking=0) |
| `bash scripts/audit/run_security_audit.sh` (`audit:security:fast`) | PASS exit 0 — secrets findings=0; env missing_docs informational |
| `npm run audit` / `audit:strict` | Compatible wrappers preserved; framework step added inside `run_full_audit.sh`. Full pipeline (lint/test/build) not re-run end-to-end in this session due to duration; framework + security:fast + unit tests validated. |


## Sample framework run (local)

- Findings: ~249 (heuristic-heavy; mostly non-blocking)
- Gate: passed (`blocking=0`) — suspected/requires-review do not block by default
- Top hotspot: `backend/src/services/whatsapp-bot.service.ts`
- God class: whatsapp-bot **MEDIUM** score 16 (LOC 2042, multi-domain, SQL outside repository, Twilio)
- SQL inventory (files with SQL keywords): repositories 52, services 32, routes 12, controllers 7

## Notes

- Full `npm run audit` still runs backend/frontend lint/typecheck/test/build (legacy). Framework adds normalized findings without replacing those checks.
- Heuristic findings (SOLID/GRASP/tenant/SQL-in-template) are `suspected` / `requires-review` and do not fail the gate unless `blocking=true` or confirmed critical security.
- Baseline: `npm run audit:baseline` now also saves `audit/baseline/findings.baseline.json`.
