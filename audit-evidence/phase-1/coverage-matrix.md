# Coverage matrix — current tooling vs Gemini methodology vs this Phase-1

Legend for **Current scripts**: COVERED / PARTIALLY_COVERED / NOT_COVERED / NOT_APPLICABLE / UNKNOWN  
**New audit required**: YES if Phase-1 (or later SAST/DAST) must deepen beyond existing scripts.

| Category | Current scripts | Gemini methodology | Applicable here | Status after Phase-1 | Evidence / decision |
|----------|----------------:|-------------------:|----------------:|---------------------:|---------------------|
| Authentication (login/2FA/reset) | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | Reviewed routes + rate-limit; no online brute-force proof |
| Session revocation (tokenVersion) | NOT_COVERED | COVERED | YES | COVERED | `auth.service.ts` / `authenticate.ts` reviewed |
| Authorization / RBAC | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | Pattern OK; not every handler call-graph proven |
| IDOR/BOLA | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Sampled attendance/WhatsApp/platform; residual risk |
| Tenant isolation | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | Regex script incomplete tables; manual review of mounts |
| Endpoint inventory | NOT_COVERED | COVERED | YES | COVERED | `endpoint-inventory.csv` (241 handlers) |
| Public endpoints | NOT_COVERED | COVERED | YES | COVERED | `public-endpoints.md` |
| Secrets hardcoded | COVERED | COVERED | YES | COVERED | `audit_secrets.py` + spot check |
| SQL injection | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | mssql params dominant; dynamic WHERE assembly residual |
| Command/path injection | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | No shell from HTTP spotted; scripts use child_process in tests/tools |
| SSRF | NOT_COVERED | COVERED | CONDITIONAL | UNKNOWN | Outbound Twilio/email/GCS — not fully mapped |
| XSS | PARTIALLY_COVERED | COVERED | YES | NOT_COVERED | Frontend not deeply audited this phase |
| CSRF | NOT_COVERED | COVERED | LOW (Bearer) | PARTIALLY_COVERED | Bearer reduces classic CSRF; null Origin CORS noted |
| Uploads / imports / exports | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Import + payroll PDF surfaces identified; depth limited |
| Dependencies / supply chain | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | npm audit in scripts; lockfiles not fully reviewed |
| Docker / deploy | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | Dev publishes SQL 1435; prod overrides ports |
| CI/CD | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Workflows listed; branch protection not verifiable from repo alone |
| Concurrency / races | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Manual attendance CAS + reminder leases sampled |
| Transactions / side effects | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | WhatsApp/email outside TX residual |
| Idempotency (webhooks/jobs) | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | MessageSid unique indexes; status callbacks |
| Jobs / leases / multi-instance | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Lease tables exist; not all jobs proven |
| Rate limiting | NOT_COVERED | COVERED | YES | COVERED (finding) | In-memory documented limitation |
| Input validation (Zod) | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | Widespread validate(); mass-assignment residual |
| Logging / PII | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Phone masking present; coords may appear in logs |
| Geolocation trust | NOT_COVERED | N/A (diff product) | YES | PARTIALLY_COVERED | Client coords inherent; server Haversine |
| WhatsApp session / phone binding | NOT_COVERED | N/A | YES | PARTIALLY_COVERED | Company resolution + ambiguity handling reviewed |
| Business logic attendance | NOT_COVERED | N/A | YES | PARTIALLY_COVERED | Manual attendance recent hardening noted; bot paths sampled |
| Migrations integrity | PARTIALLY_COVERED | COVERED | YES | PARTIALLY_COVERED | Style reviewed; full UP/DOWN matrix not re-executed |
| Threat model artifact | NOT_COVERED | COVERED | YES | COVERED | `threat-model.md` |
| SAST/DAST prep config | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Inventory ready; no `security-audit.yaml` yet |
| Variant analysis discipline | NOT_COVERED | COVERED | YES | COVERED | `variant-analysis.md` |

## Gemini coverage gaps incorporated (count)

**12** primary gaps closed or started in this Phase-1 (inventory, public endpoints, threat model, rate-limit finding, tenant script limitations, jobs sampling, WhatsApp global lookup pattern, dual-mount complexity, CORS note, PII logging, Docker port exposure, SAST/DAST prep notes).

## Follow-up rows (post architecture/Gemini agents)

| Category | Current scripts | Gemini methodology | Applicable here | Status after Phase-1 | Evidence / decision |
|----------|----------------:|-------------------:|----------------:|---------------------:|---------------------|
| BFLA (vertical privilege) | NOT_COVERED | COVERED (AuthZ state axis) | YES | PARTIALLY_COVERED | Role defaults in `company-permissions.ts`; not endpoint-exhaustive |
| Session logout/refresh | NOT_COVERED | COVERED | YES | COVERED (finding) | LOC-P1-015 |
| Platform admin synthetic role | NOT_COVERED | COVERED (trust boundary) | YES | COVERED (finding) | LOC-P1-014 + OWNER membership |
| Disposable-lab AuthZ smoke | NOT_COVERED | COVERED (Phase 4B) | YES | NOT_COVERED | Defer to security-agents Phase-2 |
| DAST priority axis on endpoints | NOT_COVERED | COVERED | YES | PARTIALLY_COVERED | Inventory has sensitivity; not full P0–P4 column yet |
