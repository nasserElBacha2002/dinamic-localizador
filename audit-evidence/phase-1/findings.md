# Findings — Phase 1 Internal Code Audit

**Project:** dinamic-localizador  
**Date:** 2026-09-21  
**Method:** Static adversarial review + call-graph sampling. No runtime exploit execution.

Classification legend: `DEFECTO_CONFIRMADO` | `RIESGO_PROBABLE` | `NO_VERIFICABLE` | `DESCARTADO` (see discarded-hypotheses.md).

---

## LOC-P1-001 — In-memory rate limiter ineffective across replicas

| Field | Value |
|-------|-------|
| Severidad | HIGH |
| Clasificación | DEFECTO_CONFIRMADO |
| Categoría | Rate limiting / AuthN |
| Archivo | `backend/src/middleware/rate-limit.ts` |
| Líneas | 8–41, 50–84 |
| Flujo | Login / 2FA / forgot-password / reset-password / invitations |
| Confianza | HIGH |

**Precondición:** Backend deployed with N > 1 processes/replicas behind a load balancer.

**Ruta de fallo:**
1. Attacker targets `POST /api/auth/login` (and sibling auth/invitation limiters).
2. Each request may hit a different replica.
3. Each replica maintains its own `Map` bucket (`rate-limit.ts`).
4. Effective attempt budget ≈ `N × AUTH_LOGIN_RATE_LIMIT_MAX` per window.

**Impacto:** Weakens brute-force / credential-stuffing controls on public auth surfaces.

**Evidencia:** Code comment explicitly states multi-instance needs a shared store; `auth.routes.ts` wires `createRateLimiter` on login.

**Contramedidas existentes:** Per-process limits, IP+actor keying, bucket size cap, dummy password hash for unknown emails (timing-ish).

**Por qué insuficientes:** Do not coordinate across instances.

**Variant analysis:** See `variant-analysis.md` VA-01 (all `createRateLimiter` consumers).

**Corrección recomendada:** Shared store (Redis/SQL) or gateway rate limit; document single-instance assumption if intentional.

**Tests requeridos:** Multi-process integration proving global cap.

---

## LOC-P1-002 — HTTP attendance create accepts client-supplied validation/geofence statuses

| Field | Value |
|-------|-------|
| Severidad | HIGH |
| Clasificación | DEFECTO_CONFIRMADO |
| Categoría | Business integrity / Mass assignment |
| Archivo | `backend/src/schemas/attendance.schema.ts`, `backend/src/services/attendance.service.ts`, `backend/src/routes/attendance.routes.ts` |
| Líneas | schema 20–32; service 42–94; routes 20–24 |
| Flujo | `POST .../attendance` (non-manual) |
| Confianza | HIGH |

**Precondición:** Authenticated user with `attendance:review` in a company.

**Ruta de fallo:**
1. Caller sends `POST /api/companies/:companyId/attendance` (or legacy `/api/attendance`) with Zod-valid body.
2. Body includes `validationStatus: "VALID"`, `locationStatus: "INSIDE_GEOFENCE"`, arbitrary lat/lng/distance, and chosen `employeeId`/`operationId`.
3. Service verifies operation/employee/assignment exist, then persists `...input` **without recomputing** geofence or punctuality.
4. Record appears as valid attendance evidence.

**Impacto:** Integrity of attendance truth compromised by privileged insider (or stolen reviewer token). Distinct from intentional manual-attendance path (which omits status enums).

**Evidencia:** `createAttendanceSchema` requires client status enums; `attendanceService.create` spreads input into repository; route uses `attendance:review` not a server-side geofence service.

**Contramedidas:** Permission gate; assignment check; duplicate active-record checks; separate manual create schema without statuses.

**Por qué insuficientes:** Permission does not equal server-side computation of location/punctuality for this endpoint.

**Variant analysis:** VA-02 — compare `manual-attendance.schema.ts` (no status) vs this schema.

**Corrección recomendada:** Remove status fields from client schema; compute server-side (or deprecate endpoint in favor of manual + review flows only).

**Tests requeridos:** POST with far coords + VALID must be rejected or statuses overwritten by server.

---

## LOC-P1-003 — Invitation tokens logged in morgan query strings

| Field | Value |
|-------|-------|
| Severidad | HIGH |
| Clasificación | DEFECTO_CONFIRMADO |
| Categoría | Logging / Secrets / PII |
| Archivo | `backend/src/app.ts`, `backend/src/schemas/user-invitation.schema.ts` |
| Líneas | app.ts:39; schema preview query token |
| Flujo | `GET /api/invitations/preview?token=...` |
| Confianza | HIGH |

**Precondición:** Access to stdout / log aggregation that captures morgan lines.

**Ruta de fallo:**
1. Invitee opens preview link with opaque token in query string.
2. `morgan("dev")` logs full URL including query.
3. Token recoverable from logs → accept invitation / account takeover of invite flow.

**Impacto:** Secret invitation tokens leak to operators/log platforms; amplifies LOC-P1-011 privacy disclosure.

**Contramedidas:** System logger sanitizes Bearer/phones for structured logs; tokens are 256-bit opaque (`randomBytes`).

**Por qué insuficientes:** Morgan is not sanitized; always enabled (no NODE_ENV guard).

**Variant analysis:** VA-03 — morgan always-on + any query secrets.

**Corrección recomendada:** Prefer body/header for tokens; redact query; use production-safe morgan format without query secrets.

**Tests requeridos:** Assert preview logging redacts token (or move token out of query).

---

## LOC-P1-004 — Jobs rely on process-local `isRunning`; some lack cross-instance fencing

| Field | Value |
|-------|-------|
| Severidad | MEDIUM |
| Clasificación | DEFECTO_CONFIRMADO (root) |
| Categoría | Concurrency / Jobs |
| Archivo | `backend/src/jobs/*.ts` (esp. `recurring-workday-materialization.job.ts`, `absence-attachment-cleanup.job.ts`) |
| Flujo | Scheduled background processing |
| Confianza | HIGH (pattern); MEDIUM (per-job data corruption) |

**Precondición:** Multiple backend replicas with jobs enabled.

**Ruta de fallo:**
1. Each replica starts interval jobs with local `isRunning` flag.
2. Tickers fire concurrently across replicas.
3. Jobs without DB lease/claim (e.g. recurring materialization horizon sweep; absence attachment cleanup) execute overlapping work.
4. Integrity depends solely on SQL uniqueness/idempotent upserts — not proven for all side effects.

**Impacto:** Duplicate work, race windows, possible inconsistent workday materialization or cleanup races; increased load.

**Contramedidas:** Several jobs add DB leases/claims (reminders, assignment notifications, absence-workday-sync, daily report, retention, cost sync, system-log). Lifecycle uses CAS `promoteLifecycleStatus`.

**Por qué insuficientes:** Process-local mutex is not a cluster fence; coverage uneven.

**Variant analysis:** VA-04 — all jobs with `isRunning` classified with/without lease.

**Corrección recomendada:** Require DB lease/leader election for every mutating job; document single-writer assumption if intentional.

**Tests requeridos:** Two-process job tick concurrency tests where missing today.

---

## LOC-P1-005 — WhatsApp geolocation trusts client coordinates (inherent + best-effort forward check)

| Field | Value |
|-------|-------|
| Severidad | MEDIUM |
| Clasificación | RIESGO_PROBABLE |
| Categoría | Geolocation / Business |
| Archivo | `backend/src/services/whatsapp-router/whatsapp-router.service.ts`, `backend/src/utils/location-message-metadata.ts` |
| Flujo | Check-in / check-out location messages |
| Confianza | HIGH (design); exploitability depends on device spoofing |

**Precondición:** Valid Twilio-signed inbound location for assigned employee.

**Ruta de fallo:**
1. Device reports spoofed lat/lng inside store radius (or forward without Twilio Forwarded flags).
2. Server Haversine accepts; attendance VALID.
3. `ChannelMetadata` / Forwarded checks are documented best-effort; absent → do not reject.

**Impacto:** Attendance fraud within WhatsApp threat model. Distinguish **inherent channel limitation** vs missing server checks (server still enforces radius/assignment/window).

**Contramedidas:** Twilio signature; MessageSid uniqueness; assignment/time/geofence server rules; anti-forward best-effort.

**Corrección recomendada:** Document residual spoofing risk; optional review-margin UX; never claim GPS as non-spoofable.

**Tests:** Already partial; keep adversarial cases for missing Forwarded metadata.

---

## LOC-P1-006 — CORS allows missing Origin

| Field | Value |
|-------|-------|
| Severidad | LOW |
| Clasificación | DEFECTO_CONFIRMADO |
| Categoría | Configuration |
| Archivo | `backend/src/app.ts` |
| Líneas | 24–27 |
| Confianza | HIGH |

**Impacto:** Expected for non-browser clients; classic browser CSRF reduced by Bearer tokens (no cookie session observed). Literal `Origin: null` string is not auto-allowed.

**Corrección:** Document intentional; keep Bearer-only; avoid cookie auth without CSRF tokens.

---

## LOC-P1-007 — Dual API mounts expand attack surface

| Field | Value |
|-------|-------|
| Severidad | LOW |
| Clasificación | RIESGO_PROBABLE |
| Categoría | API surface |
| Archivo | `backend/src/routes/index.ts` |
| Confianza | HIGH |

**Impacto:** Same operational routers mounted at `/api/companies/:companyId/...` and legacy `/api/...` → doubled paths for DAST/fuzzing; legacy company resolution via membership heuristics. Authz on leaf routers appears consistent (sampled).

**Corrección:** Prefer company-scoped only; deprecate legacy with monitoring.

---

## LOC-P1-008 — Internal tenant-isolation audit script incomplete

| Field | Value |
|-------|-------|
| Severidad | INFO |
| Clasificación | DEFECTO_CONFIRMADO (tooling gap) |
| Categoría | Audit coverage |
| Archivo | `scripts/audit/audit_tenant_isolation.py` |
| Líneas | 50–74, 71–74 |
| Confianza | HIGH |

**Impacto:** False assurance if script reports clean. Tables such as payroll, workdays, quotas, attachments omitted; UPDATE/DELETE regex only.

**Corrección:** Expand table list + SELECT/IDOR patterns; do not use as sole tenant proof.

---

## LOC-P1-009 — Dev compose publishes SQL Server on host port 1435

| Field | Value |
|-------|-------|
| Severidad | MEDIUM (mis-deploy) / INFO (prod override used) |
| Clasificación | DEFECTO_CONFIRMADO |
| Categoría | Docker / Deployment |
| Archivo | `docker-compose.yml` :13–14; `docker-compose.prod.yml` ports override |
| Confianza | HIGH |

**Ruta de fallo:** Deploy using base compose without prod override → SQL reachable on host:1435.

**Contramedida:** `docker-compose.prod.yml` sets `ports: !override []`.

---

## LOC-P1-010 — Twilio signature validation can be disabled outside production

| Field | Value |
|-------|-------|
| Severidad | MEDIUM |
| Clasificación | RIESGO_PROBABLE |
| Categoría | WhatsApp / Misconfiguration |
| Archivo | `backend/src/utils/twilio-webhook-signature.ts`, `backend/src/config/env.ts` |
| Confianza | HIGH |

**Ruta de fallo:** Non-prod (or mis-set env) with `TWILIO_VALIDATE_SIGNATURE=false` → forged webhooks drive bot/attendance. Empty auth token with validation **on** correctly fails closed.

**Contramedida:** Production schema forces validation + token.

---

## LOC-P1-011 — Invitation preview discloses email for valid tokens

| Field | Value |
|-------|-------|
| Severidad | LOW |
| Clasificación | RIESGO_PROBABLE |
| Categoría | Privacy |
| Archivo | `user-invitation.service.ts` (preview) |
| Confianza | HIGH |

Amplifies LOC-P1-003 if token leaked. Invalid tokens return uniform INVALID (enumeration mitigated).

---

## LOC-P1-012 — Morgan `dev` format always enabled

| Field | Value |
|-------|-------|
| Severidad | LOW |
| Clasificación | DEFECTO_CONFIRMADO |
| Categoría | Logging |
| Archivo | `backend/src/app.ts:39` |
| Confianza | HIGH |

No NODE_ENV branching; verbose access logs in all environments. Root-related to LOC-P1-003.

---

## LOC-P1-013 — No localizador `security-audit.yaml` for SAST/DAST orchestration

| Field | Value |
|-------|-------|
| Severidad | INFO |
| Clasificación | DEFECTO_CONFIRMADO (readiness gap) |
| Categoría | Security program |
| Archivo | (missing at repo root; Gemini has `security-audit.yaml`) |
| Confianza | HIGH |

Blocks turnkey consumption by `dinamic-security-agents` without adaptation. Inventory from this phase is the input.

---

## LOC-P1-014 — Platform observability cross-tenant by design

| Field | Value |
|-------|-------|
| Severidad | INFO |
| Clasificación | RIESGO_PROBABLE (abuse if platform admin compromised) |
| Categoría | Authorization / Trust boundary |
| Archivo | `whatsapp-observability*.ts`, `findByIdGlobal` |
| Confianza | HIGH |

Not a bug if `requirePlatformAdmin` holds; high-value blast radius for platform credential theft. Document as privilege boundary.

---

## Summary counts

| Severity | Count |
|----------|------:|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 4 |
| LOW | 5 |
| INFO | 3 |
| **Total** | **15** |

| Classification | Count |
|----------------|------:|
| DEFECTO_CONFIRMADO | 10 |
| RIESGO_PROBABLE | 4 |

Production blockers (recommend fix/mitigate before treating attendance as high-assurance): **LOC-P1-001, LOC-P1-002, LOC-P1-003**; plus ensure **LOC-P1-009/010** prod configs.
