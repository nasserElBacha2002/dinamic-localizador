# WhatsApp Observability — Architecture

```text
Twilio inbound
    ↓
Webhook claim (MessageSid idempotency)
    ↓
Conversation (phone_hash + company + idle window, UPDLOCK)
    ↓
Inbound message (+ correlation_id)
    ↓
Flow execution
    ├── Steps
    ├── Candidates (reason_code)
    ├── Session / attendance links
    └── Domain action (typed resultCode)
    ↓
Outbound message (causation_id = execution.id)
    ↓
Twilio provider events (status callbacks, append-only)
    ↓
Projection → message.provider_status + notification.provider_*
    ↓
Platform observability panel (/platform/observability/whatsapp)
```

## Feature flags

| Variable | Default | Purpose |
|---|---|---|
| `WHATSAPP_OBSERVABILITY_ENABLED` | true | Persist traces from bot/reminders |
| `WHATSAPP_OBSERVABILITY_UI_ENABLED` | true | Expose platform API + UI |
| `WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED` | true | Accept status callbacks |
| `TWILIO_STATUS_CALLBACK_URL` | required in prod when callbacks on | Exact public URL Twilio signs |
| `WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET` | required in prod when obs on | Dedicated phone hash/encrypt secret (not JWT) |
| `WHATSAPP_OBSERVABILITY_TEMPLATE_VARS_RETENTION_DAYS` | falls back to MESSAGE_RETENTION | Clears `template_variables_json` only |
| `WHATSAPP_OBSERVABILITY_FLOW_RETENTION_DAYS` | 90 | Deletes old executions/steps |
| `WHATSAPP_OBSERVABILITY_CANDIDATE_RETENTION_DAYS` | 90 | Deletes old candidates |
| `WHATSAPP_OBSERVABILITY_PROVIDER_EVENT_RETENTION_DAYS` | 90 | Deletes old provider events |
| `WHATSAPP_OBSERVABILITY_CLEANUP_JOB_ENABLED` | true | Periodic cleanup (single-process lock; run on one replica) |

**Do not infer** status callback URL from the inbound webhook URL. Signature validation uses distinct validators for `TWILIO_WEBHOOK_URL` and `TWILIO_STATUS_CALLBACK_URL`.

Public route:

`POST /api/webhooks/twilio/whatsapp/status`

## Security

All `/api/platform/observability/whatsapp/*` routes require `authenticate` + `requirePlatformAdmin`.

Message DTOs always mask `phoneFrom` / `phoneTo` and omit coordinates + raw payload unless an explicit audited reveal is used.

Phones at rest: `phone_hash` + `phone_masked` + encrypted `phone_normalized` (`v1:...`) using `WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET`.

## Conversation grouping

- Hash phone with dedicated observability secret
- Resolve/create open conversation under SQL Server `UPDLOCK, HOLDLOCK`
- Allow null company/employee until resolved (including blocked multi-company)

## Status callbacks

- Persist append-only `whatsapp_provider_events` first
- Idempotent unique key → HTTP 204
- Persistence failure → HTTP 5xx (Twilio may retry)
- Orphan events (`message_id` null) reconciled via `linkPendingProviderEvents` when outbound message is linked
- Notification projection uses `provider_*` columns (distinct from API-accepted `SENT`)

## Fail-open vs fail-closed

| Path | Policy |
|---|---|
| Bot / reminders tracing | Fail-open (never block TwiML / attendance) |
| Status callback ingest | Fail-closed on persistence (5xx) |

## Historical data

Existing `whatsapp_messages` rows remain valid with null observability columns. No blocking backfill; linkage starts for new traffic.

## Migrations

- `076_whatsapp_observability_foundation` — core tables + additive columns
- `077_whatsapp_observability_corrections` — encrypted phone width, notification `provider_*`, selected FKs
