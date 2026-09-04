# WhatsApp retention (30 days)

Automatic cleanup of **technical and conversational** WhatsApp data. Core business facts (`attendance_records`, operations, employees, absences, payroll, etc.) are never deleted by this job.

## Policy

- Default retention: **30 days** (`WHATSAPP_RETENTION_DAYS=30`)
- Cutoff: `SYSUTCDATETIME() - WHATSAPP_RETENTION_DAYS` (UTC)
- Only **terminal** rows without active leases/retries are eligible
- Purge order respects FK `NO ACTION` chains (child → parent)

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

- Job: `whatsapp-retention-cleanup.job.ts` (replaces legacy `whatsapp-observability-cleanup.job`)
- Service: `whatsapp-retention.service.ts`
- Repository: `whatsapp-retention.repository.ts`
- Distributed lock: SQL Server `sp_getapplock` (Session owner, resource `whatsapp-retention-cleanup`)

## Troubleshooting

- **No rows deleted:** check `WHATSAPP_RETENTION_DRY_RUN`, active conversations/sessions, pending webhooks/outbox rows.
- **Lock skipped:** another backend instance is running cleanup (expected with multi-replica).
- **FK errors:** report as bug — purge order should prevent this.

## Validation SQL (read-only)

Use [`database-retention-audit.sql`](../database-retention-audit.sql) sections 7–11 before/after enabling deletes.
