# Security events (product)

Compact inventory of high-value security / audit signals for Dinamic Attendance.

**Invariant:** raw secrets (Authorization, Cookie, JWT, refresh/invitation tokens, passwords, Twilio auth tokens) must never appear in logs.

## Event codes

| Code | Where | Meaning | Action |
|------|--------|---------|--------|
| `AUTH_INVALID_TOKEN` | auth middleware | JWT missing/malformed/expired | Investigate volume spikes; no user action if isolated |
| `AUTH_REVOKED_TOKEN` / token version mismatch | authenticate | Logout / password change invalidated session | Expected after logout; spikes may mean stolen-token churn |
| `TENANT_ACCESS_DENIED` | company context | Cross-tenant access blocked | Investigate possible IDOR probing |
| `FORBIDDEN` | permission middleware | Authenticated but lacking permission | Role misconfig or probing |
| `RATE_LIMITED` | rate-limit middleware | Client exceeded quota | Expected under abuse; check shared store health |
| `RATE_LIMIT_STORE_UNAVAILABLE` | rate-limit middleware | SQL/memory store failure | **Ops:** restore DB/rate-limit store; fail-open/closed per config |
| `TWILIO_SIGNATURE_INVALID` | Twilio webhook | Bad `X-Twilio-Signature` | **Security:** possible spoofing; verify webhook URL + auth token |
| `TWILIO_SIGNATURE_CONFIG_MISSING` | Twilio webhook | Missing signature or auth token config | **Ops:** fix env / client |
| `WEBHOOK_REPLAY_ANOMALY` / `PAYLOAD_ANOMALY` | webhook claim | Same MessageSid, different payload hash | **Security:** investigate replay / mutation |
| `IDEMPOTENT_REPLAY` | webhook claim | Same MessageSid + same hash | Benign Twilio retry |
| `attendance.create.legacy_derived_fields_ignored` | attendance schema | Client sent pre-4A derived fields | Informational; server ignores |
| `attendance.validation.authoritative` | attendance service | Server computed geofence/punctuality | Audit trail |
| `http.request.failed` | error handler | 5xx / unhandled | Ops triage; client sees safe message only |
| Config / lock failures | jobs | Distributed lock or config load errors | Ops; do not ignore repeated failures |

## Correlation fields (preferred)

When emitting security-relevant logs, include when available:

- `event` (stable code)
- timestamp (logger default)
- `companyId` (tenant)
- `userId` / actor (when authenticated)
- `requestId` / correlation id
- `reason` / outcome

Never include: raw tokens, passwords, full GPS coordinates in general security events (prefer distance bucket / inside-outside / decision).

## What these events do NOT contain

- Authorization / Cookie headers
- JWT or refresh token material
- Invitation / password-reset tokens
- Twilio `AuthToken`
- Raw SQL or stack traces in **client** responses (internal logs may keep sanitized diagnostics)
