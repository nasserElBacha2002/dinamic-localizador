# Gemini / security-agents methodology reference

## Sources inspected

- `/Users/nasserelbacha/Documents/Dinamic sistems/dinamic-gemini/security-audit.yaml`
- `/Users/nasserelbacha/Documents/Dinamic sistems/dinamic-gemini/scripts/audit/*` (parallel internal audit scripts)
- `/Users/nasserelbacha/Documents/Dinamic sistems/dinamic-gemini/.cursor/commands/audit-readonly.md`
- `/Users/nasserelbacha/Documents/Dinamic sistems/dinamic-security-agents/security-agents/` (SAST/DAST framework, phase gates, checklists)
- Sibling `dinamic-security-agents` Cursor commands: discover → map → threat → sast → dast plan/passive/active → validate → remediate

## Categories Gemini / security-agents prepare for (methodology)

Authentication & session; authorization & IDOR/BOLA; tenant isolation; endpoint inventory from real routes; public endpoints; secrets (gitleaks); SQLi / injection suites (DAST); concurrency & mutating gates; destructive route review; target policy (block prod-like hosts); OpenAPI-assisted discovery; dependency/SAST tool selection (semgrep, trivy, osv, npm audit, CodeQL detect_only); Docker/supply chain (trivy); CI/CD discipline; evidence schemas & run manifests; mutating DAST confirmations; cleanup endpoints for disposable DBs.

## What localizador already mirrors

- Similar `scripts/audit` shell/python suite (shared DNA with Gemini’s scripts/audit)
- npm audit + secrets + env documentation
- Architecture complexity scanners

## Gaps to import into THIS Phase-1 (manual)

1. Formal **endpoint inventory + public endpoint classification** (done here as CSV)
2. Explicit **threat model** tied to actors (employee WhatsApp vs company operator vs platform admin)
3. **Authz/IDOR** call-graph review beyond regex
4. **Job/lease/idempotency** adversarial review
5. **Business-logic** attendance/geolocation/WhatsApp session properties
6. Preparation artifacts for later **security-agents DAST** (`security-audit.yaml` does not exist yet for localizador)
7. Phase-gate discipline from `phase-gates.md` (run id, read-only porcelain, schema-valid findings)

## Important

Do **not** copy Gemini findings. Architectures differ (FastAPI/CV pipeline vs Express/WhatsApp attendance).


## Historical methodology pipeline (from Gemini git history + security-agents)

> Working tree of `dinamic-gemini` no longer contains `audit/september-*` (removed in commit `7681c7f6`). Reconstruct via `git show e3a7c0a2:audit/...` and sibling `dinamic-security-agents`.

| Phase | Artifact (historical / living) | Purpose |
|-------|-------------------------------|---------|
| 1 | `audit/september-code-audit/` (`e3a7c0a2`) | Manual + tool code audit package (`00`–`12`) |
| 2 | `audit/september-endpoint-inventory/` | Route inventory CSV, AuthZ/BOLA axes, DAST cases |
| 3 | `dinamic-security-agents/.../dinamic-gemini-security-repository-assessment/` | Framework readiness vs product needs |
| 4A/4B | `dinamic-security-agents/audit/implementation/dinamic-gemini-phase-4*` | Ingest, directed SAST, AuthZ smoke lab |
| Living | `dinamic-gemini/security-audit.yaml` | Declarative SAST/DAST config |
| Parallel | `scripts/audit/*` + `docs/quality-gate.md` | Continuous quality collectors (≠ adversarial AuthZ) |

### Classification axes Gemini used (do not collapse)

- Finding severity: CRITICAL…INFO
- Confidence: VERIFIED/INFERRED or CONFIRMED/LIKELY/NEEDS_MANUAL_VALIDATION/FALSE_POSITIVE
- DAST priority (endpoint): separate from finding severity
- AuthZ state: CONTROL_VERIFIED | POTENTIAL_BOLA | AUTHORIZATION_UNKNOWN | N/A — **POTENTIAL_BOLA ≠ confirmed vuln**
- Coverage: FULL | PARTIAL | NONE | N/A

### Extra categories Gemini evaluated that Phase-1 localizador should keep tracking into Phase-2

BFLA, ZIP slip/bomb (if uploads), OpenAPI/docs exposure, prompt injection (N/A here), mobile/Expo (N/A unless added), disposable-lab AuthZ A/B smoke, Semgrep directed rulesets, fail-closed DAST gates.

Sources: [Explore architecture](f46b736e-c426-421d-a407-784e5ff7be86) informal; methodology detail from Gemini analysis agent output in session.
