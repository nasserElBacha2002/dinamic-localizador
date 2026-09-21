# Phase 1 Final Report — Internal Code Audit

**Project:** dinamic-localizador  
**Date:** 2026-09-21  
**Mode:** READ-ONLY  
**Readiness status:** `READY_WITH_CODE_RISKS`

---

## Executive summary

Phase-1 reconstructed the Express/SQL Server/WhatsApp attendance architecture, inventoried **241** route handlers (~**13** public/conditional), compared coverage against Gemini/`dinamic-security-agents` methodology, and produced an adversarial findings set with variant analysis.

**Findings:** 15 total — Critical **0**, High **3**, Medium **4**, Low **5**, Info **3**.  
**Confirmed defects:** 10 · **Probable risks:** 5 · **Unverified topics:** 10 (see `unverified-items.md`).

Principal risks: (1) in-memory auth rate limits fail under horizontal scale; (2) privileged `POST /attendance` trusts client geofence/validation statuses; (3) invitation tokens appear in morgan access logs. Secondary: uneven job fencing, SQL port on base compose, Twilio validation disable outside prod, residual GPS spoofing.

Coverage beyond existing `scripts/audit/*` was achieved for inventory, threat model, business-integrity attendance path, jobs concurrency sampling, and public-endpoint classification. Exhaustive IDOR/DAST and deep frontend XSS remain for Phase-2.

**Conclusion:** Manual baseline is sufficient to feed the external security repository/SAST-DAST pipeline, but code risks must stay prioritized — hence `READY_WITH_CODE_RISKS` (not “secure”).

---

## Arquitectura reconstruida

See `architecture.md`.

Trust path: Helmet/CORS → `/api` → JWT (`tokenVersion`) → company membership + module/permission gates → Zod → service → parameterized mssql. Parallel: Twilio signature webhooks → company/phone resolution → bot → attendance. Jobs: setInterval + mixed lease/CAS/process-local mutex.

---

## Superficie de ataque

| Surface | Notes |
|---------|-------|
| Public auth + invitations | Rate-limited in-process |
| Twilio webhooks | Signature-gated (fail-open only if validation disabled) |
| Company APIs dual-mount | Preferred path + legacy |
| Platform admin | Cross-tenant observability |
| Background jobs | Multi-instance sensitivity |
| Imports/attachments/exports | Identified; depth limited |

Inventory: `endpoint-inventory.csv` · Public: `public-endpoints.md`.

---

## Comparación con Gemini

Gemini/`security-agents` contributed **methodology gaps**, not findings:

1. Endpoint inventory from real routes  
2. Public endpoint classification  
3. Explicit threat model actors  
4. Authz/IDOR call sampling beyond regex  
5. Jobs/leases/idempotency review  
6. Business-logic attendance properties  
7. SAST/DAST prep awareness (`security-audit.yaml` missing here)  
8. Phase-gate / evidence schema discipline  
9. Variant analysis requirement  
10. Distinction confirmed vs probable vs unverified  
11. Production blockers vs residual  
12. Dual-mount / webhook / geolocation product-specific extensions  

Localizador still lacks a checked-in `security-audit.yaml` (LOC-P1-013).

---

## Findings (by severity)

### HIGH
- **LOC-P1-001** In-memory rate limiter multi-instance  
- **LOC-P1-002** Client-trusted attendance validation statuses  
- **LOC-P1-003** Invitation tokens in morgan logs  

### MEDIUM
- **LOC-P1-004** Job fencing incomplete across replicas  
- **LOC-P1-005** GPS/forward residual (probable)  
- **LOC-P1-009** SQL 1435 on base compose  
- **LOC-P1-010** Twilio signature disable outside prod  

### LOW / INFO
- LOC-P1-006 CORS missing Origin · LOC-P1-007 dual mounts · LOC-P1-011 preview email · LOC-P1-012 morgan always-on · **LOC-P1-015 no logout/refresh** · LOC-P1-008 audit script gap · LOC-P1-013 missing security-audit.yaml · LOC-P1-014 platform admin synthetic OWNER blast radius  

Details: `findings.md` / `findings.csv`.

---

## Root causes

1. **Process-local security controls** (rate limit Map; job `isRunning`) assumed single writer.  
2. **Legacy attendance HTTP create** accepts security-decision fields from clients.  
3. **Access logging** not treated as a secrets sink.  
4. **Audit scripts** optimized for quality heuristics, not adversarial completeness.  
5. **Intentional privilege boundaries** (platform admin, GPS channel limits) need operational hardening, not only code.

---

## Variant analysis

See `variant-analysis.md` (VA-01…VA-05). Root findings preferred over per-endpoint clones.

---

## Áreas no verificables

See `unverified-items.md` (UV-01…UV-10): full IDOR matrix, XSS, SSRF, formula injection, org branch protection, production runtime flags, supply-chain depth.

---

## Riesgos residuales

- GPS spoofing inherent to WhatsApp location channel  
- Privileged insider with `attendance:review` / platform admin  
- Deploy using wrong compose file  
- Non-prod Twilio validation off accidentally promoted  
- Legacy dual mount forever increasing scanner noise  

---

## Preparación requerida para SAST/DAST

Consume from this phase:

| Artifact | Use |
|----------|-----|
| `endpoint-inventory.csv` | Route discovery vs OpenAPI |
| `public-endpoints.md` | Safe unauthenticated targets |
| `threat-model.md` | Actor fixtures / roles |
| `findings.*` | Seed + correlation |
| Auth model | Bearer JWT + company membership + platform admin |
| Tenants | `companyId` path vs legacy membership |
| Destructive endpoints | company deletion, retention, payroll, manual attendance |
| Business properties | No checkout without check-in; MessageSid idempotency; geofence server-side for bot; no client VALID on create |

**Still needed before active DAST:** disposable DB/fixtures, `security-audit.yaml` for localizador, target policy blocking prod hosts, auth token fixtures per role.

---

## Production blockers

Treat as blockers for **high-assurance attendance** / multi-replica auth hardening:

1. LOC-P1-001 — shared rate limiting if multi-instance  
2. LOC-P1-002 — remove client status trust on attendance create  
3. LOC-P1-003 — stop logging invitation tokens  
4. Ops confirm: prod compose (no SQL publish) + Twilio validation forced  

---

## Conclusión

```text
READY_WITH_CODE_RISKS
```

Phase-1 baseline is reproducible under `audit-evidence/phase-1/`. No remediations applied (by design). Next: remediate prioritized Highs **or** wire `dinamic-security-agents` SAST/DAST using this inventory while tracking code risks explicitly.

## Follow-up from exploration agents

Incorporated without product code changes:

- Architecture notes: no logout/refresh; platform admin → synthetic OWNER; in-process jobs; upload/export surfaces ([Explore current repo architecture](f46b736e-c426-421d-a407-784e5ff7be86)).
- Gemini methodology: historical `september-code-audit` / endpoint-inventory pipeline, multi-axis classification (severity ≠ DAST priority ≠ AuthZ state), Phase 4B lab pattern ([Analyze Gemini audit methodology](f0055b84-572d-49c6-aa5f-d3a5afacb899)).
- New finding **LOC-P1-015**; expanded LOC-P1-014; coverage matrix BFLA/session/lab rows; UV-11…13.
