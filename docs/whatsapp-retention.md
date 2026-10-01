# WhatsApp retention (30 days)

Automatic cleanup of **technical and conversational** WhatsApp data. Core business facts (`attendance_records`, operations, employees, absences, payroll, etc.) are never deleted by this job.

## Policy

- Default retention: **30 days** (`WHATSAPP_RETENTION_DAYS=30`)
- Cutoff: `SYSUTCDATETIME() - WHATSAPP_RETENTION_DAYS` (UTC)
- Only **terminal** rows without active leases/retries are eligible
- Purge order respects FK `NO ACTION` chains (child → parent)
- Idle **ACTIVE** conversations are closed to **COMPLETED** by the lifecycle job
  (`WHATSAPP_CONVERSATION_IDLE_TIMEOUT_HOURS`, default 24h) before retention can purge their messages
- Abandoned `STARTED` flows and expired-lease `PROCESSING` webhooks are reconciled to
  terminal `FAILED` by the same lifecycle job (never marked `PROCESSED`)
- `whatsapp_message_cost_ledger` uses a **separate** TTL (`WHATSAPP_COST_LEDGER_RETENTION_DAYS`,
  default 365) and stays disabled until `WHATSAPP_COST_LEDGER_RETENTION_ENABLED=true`

## Tables affected

| Table | Age column | Guards |
|-------|------------|--------|
| `whatsapp_flow_candidates` | execution `finished_at` / `started_at` | non-`STARTED` execution |
| `whatsapp_flow_steps` | same | same |
| `whatsapp_provider_events` | `received_at` | — |
| `whatsapp_flow_executions` | `finished_at` / `started_at` | terminal status, no steps/candidates |
| `*_notification_send_attempts` | parent outbox terminal + age | — |
| `whatsapp_*_notifications` | `sent_at` / `updated_at` / `created_at` | terminal, no active lease/retry |
| `whatsapp_payroll_receipt_query_deliveries` | `created_at` | — |
| `whatsapp_messages` | `created_at` | not in `ACTIVE` conversation; no provider/flow FK |
| `whatsapp_webhook_events` | `processed_at` / `created_at` | terminal + no active lease |
| `whatsapp_conversations` | `last_activity_at` | `status <> ACTIVE`, no messages/flows |
| `bot_sessions` | `expires_at` | `COMPLETED` / `CANCELLED` / `EXPIRED`; no payroll delivery FK |
| `bot_simulation_sessions` | `created_at` | — |

## Excluded (never purged)

- `audit_logs`
- `attendance_records`, absences, operations, employees, companies, users, payroll, configuration

## Configuration

```env
WHATSAPP_RETENTION_DAYS=30
WHATSAPP_RETENTION_DRY_RUN=true          # Deploy 1: report only
WHATSAPP_RETENTION_BATCH_SIZE=500
WHATSAPP_RETENTION_MAX_BATCHES_PER_TABLE=100
WHATSAPP_RETENTION_CLEANUP_JOB_ENABLED=true
WHATSAPP_RETENTION_CLEANUP_INTERVAL_MS=21600000   # 6 hours
WHATSAPP_CONVERSATION_IDLE_TIMEOUT_HOURS=24
WHATSAPP_FLOW_STARTED_TIMEOUT_HOURS=24
WHATSAPP_LIFECYCLE_JOB_ENABLED=true
WHATSAPP_LIFECYCLE_DRY_RUN=false
WHATSAPP_LIFECYCLE_JOB_INTERVAL_MS=3600000
WHATSAPP_COST_LEDGER_RETENTION_ENABLED=false
WHATSAPP_COST_LEDGER_RETENTION_DAYS=365
```

Manual run (dev/staging):

```bash
cd backend
npm run job:whatsapp-retention -- --dry-run
WHATSAPP_RETENTION_DRY_RUN=false npm run job:whatsapp-retention
```

## Rollout

1. **Deploy 1:** `WHATSAPP_RETENTION_DRY_RUN=true` — validate candidate counts in logs.
2. **Deploy 2:** `WHATSAPP_RETENTION_DRY_RUN=false` with conservative batch limits.
3. **Deploy 3:** Tune `WHATSAPP_RETENTION_BATCH_SIZE` if needed.

## Architecture

- Lifecycle job: `whatsapp-lifecycle.job.ts` (idle conversations / stuck flows / abandoned webhooks)
- Retention job: `whatsapp-retention-cleanup.job.ts` (replaces legacy `whatsapp-observability-cleanup.job`)
- Service: `whatsapp-retention.service.ts` + `whatsapp-lifecycle.service.ts`
- Repository: `whatsapp-retention.repository.ts` + `whatsapp-lifecycle.repository.ts`
- Distributed lock: SQL Server `sp_getapplock` (Session owner; separate resources for lifecycle vs retention)

Post-deploy READ-ONLY checks: `scripts/whatsapp-retention/verify-lifecycle-readonly.sql`

## Troubleshooting

- **No rows deleted:** check `WHATSAPP_RETENTION_DRY_RUN`, active conversations/sessions, pending webhooks/outbox rows.
- **Lock skipped:** another backend instance is running cleanup (expected with multi-replica).
- **FK errors:** report as bug — purge order should prevent this.

## Validation SQL (read-only)

Use [`database-retention-audit.sql`](../database-retention-audit.sql) sections 7–11 before/after enabling deletes.
