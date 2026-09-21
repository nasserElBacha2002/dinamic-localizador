# Existing internal audit tooling (this repo)

## Location

`scripts/audit/` → writes under `audit/` (gitignored run outputs under `audit/raw/`).

## Entry points

| Script | What it does |
|--------|----------------|
| `run_full_audit.sh` | Orchestrates backend/frontend architecture + security + framework deep audit |
| `run_backend_audit.sh` / `run_frontend_audit.sh` | Package/lint-oriented checks |
| `run_backend_architecture_audit.sh` / `run_frontend_architecture_audit.sh` | Structure / coupling heuristics |
| `run_security_audit.sh` | `npm audit`, `audit_secrets.py`, `audit_env_documentation.py`, Docker notes |
| `run_security_audit_deep.sh` | Optional gitleaks if installed |
| `run_framework_audit.py` | Normalized findings via `framework/scanners/*` |
| `audit_tenant_isolation.py` | Regex scan: scopedApiClient usage; `WHERE id=@id` without nearby `company_id` |
| `audit_sql_analysis.py` | SQL heuristic scans |
| `audit_secrets.py` | Hardcoded secret heuristics |
| `enforce_quality_gate.py` | Gate on audit status JSON |

## Framework scanners (`scripts/audit/framework/scanners/`)

architecture, complexity, dead_env, exceptions, god_class, patches, reliability, solid_grasp, sql_boundaries — **mostly engineering quality**, not adversarial authz/tenant/business-logic.

## What it does NOT reliably cover

1. Endpoint-by-endpoint authorization matrix
2. IDOR/BOLA with real call graphs
3. Concurrency / race / lease correctness under multi-instance
4. Business rules (attendance workday identity, geofence spoofing threat model nuances)
5. Twilio replay beyond signature presence
6. Full OpenAPI/DAST preparation inventory
7. Jobs poison / retry / outbox semantics end-to-end
8. Complete tenant table inventory (script table list is incomplete vs current schema: payroll, workdays, quotas, …)
9. False negatives: parameterized SQL with dynamic `whereClause` assembly may look safe while filters are wrong
10. Running `npm run audit` ≠ security sign-off

## False-assurance risk

`audit_tenant_isolation.py` reports “clean” if regexes miss; it does not execute queries or prove every HTTP handler passes `companyId` into repositories.
