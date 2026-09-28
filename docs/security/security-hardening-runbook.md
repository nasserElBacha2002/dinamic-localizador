# Security hardening runbook (Phase 4E)

Operational guide for residual hardening controls. Does **not** replace Phase 5 adversarial retest.

## Logging / redaction

- Access logs use morgan `:safe-url` → `sanitizeUrlForLogs` (`backend/src/utils/log-redaction.ts`).
- Structured system logs use `backend/src/utils/system-logs/sanitize.ts`.
- Object dumps: prefer `sanitizeObjectForLogs` / `sanitizeHeadersForLogs`.
- Phones: `maskPhoneNumberForLog` / `maskPhoneForLogs`.

**If a raw token appears in logs:** treat as incident → rotate affected secrets/tokens → patch logging site → add regression test.

## CORS

- Allowlist: `FRONTEND_URL` + optional `CORS_ALLOWED_ORIGINS` via `parseCorsOrigins`.
- Missing `Origin` is allowed (Twilio, health checks, server clients). Auth still required where applicable.
- No `Access-Control-Allow-Origin: *` with credentials (credentials not enabled on CORS).

## Legacy routes

| Route | Preferred | Status |
|-------|-----------|--------|
| `GET /api/invitations/preview?token=` | `POST /api/invitations/preview` body | **DEPRECATED** — retained; frontend uses POST |
| `PUT .../absences/.../balance` | `POST .../adjustments` | **DEPRECATED** — Sunset header |
| `/workers` | `/employees` | Alias — same router/middleware |

Removal of invitation GET requires confirmed zero traffic + client migration.

## Twilio webhooks

1. Signature validated with configured `TWILIO_WEBHOOK_URL` + auth token (not request Host).
2. Invalid/missing signature → **403** (`TWILIO_SIGNATURE_*`).
3. MessageSid claim: same hash → idempotent; different hash → `PAYLOAD_ANOMALY`.
4. Company resolution via To/number is **single-tenant heuristic** — multi-company mapping is residual (see `whatsapp-company-context.service.ts` TODO).

Local/test signature bypass must be explicit in config and never default in production.

## Location / GPS spoofing

- Server-authoritative validation (Phase 4A) is preserved: client `locationStatus` / `distanceMeters` / `validationStatus` are ignored.
- Device GPS cannot be cryptographically proven true → **ACCEPTED_RESIDUAL_RISK** (LOC-P1-005).
- No automatic block on travel heuristics in 4E (false-positive risk). Prefer audit flags in a future approved phase.

## Security headers

- `helmet` enabled (includes `X-Content-Type-Options`, frameguard, etc.).
- `Referrer-Policy: no-referrer`.
- HSTS: rely on TLS terminator / reverse proxy unless product owns TLS termination.
- Strict CSP: **not** imposed in 4E without asset inventory (avoid breaking SPA).

## Error responses

Clients receive stable `error.code` + user-safe Spanish message. No stack / SQL / paths.

## Readiness

Critical security dependencies: DB (auth, rate-limit SQL store when configured). Optional stores must not falsely block readiness.

## Phase 5

Use `audit-evidence/phase-4e/phase-5-retest-matrix.csv`. Do not run full DAST/SAST under 4E.
