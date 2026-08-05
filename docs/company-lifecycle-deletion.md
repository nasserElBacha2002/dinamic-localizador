# Company lifecycle: deactivation and scheduled deletion

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPANY_DELETION_GRACE_PERIOD_DAYS` | `30` | Days between deactivation and hard delete |
| `COMPANY_DELETION_JOB_ENABLED` | `true` | Enable in-process deletion scheduler |
| `COMPANY_DELETION_JOB_INTERVAL_MS` | `3600000` | Job tick interval |
| `COMPANY_DELETION_LEASE_MS` | `1800000` | Claim lease duration (renewed during purge) |
| `COMPANY_DELETION_MAX_ATTEMPTS` | `10` | Max attempts before long backoff |
| `COMPANY_DELETION_RETRY_BASE_MS` | `60000` | Base exponential backoff for retries |
| `COMPANY_PROTECTED_IDS` | _(empty)_ | Comma-separated UUIDs that cannot be deactivated (**preferred**) |
| `COMPANY_PROTECTED_NAMES` | `Dinamic Systems` | Legacy name fallback **only when `COMPANY_PROTECTED_IDS` is empty** |

## Operational gate (ACTIVE only)

Company-scoped HTTP APIs resolve tenants through:

- `companyContextService` → requires `isCompanyOperationallyActive(status)`
- `companyService.getCompanyOrThrow` → same
- Membership listing joins `c.status = 'ACTIVE'`
- WhatsApp resolves companies via `companyRepository.listActive()`
- Attendance reminders iterate `listActive()`
- Invitation accept/create require company `ACTIVE`

Non-ACTIVE companies (`PENDING_DELETION`, `DELETING`, etc.) cannot create operational effects through these paths.

## State flow

```text
ACTIVE / INACTIVE / SUSPENDED
        │ deactivate (Super Admin + applock)
        ▼
PENDING_DELETION ──reactivate──► ACTIVE
        │ scheduled_deletion_at <= now (job claim)
        ▼
     DELETING ──purge OK──► DELETED (tombstone)
        │
        ├──lease expires──► reclaimable by another worker (stays DELETING)
        └──purge fail──► DELETION_FAILED ──backoff──► reclaim
```

### Lease recovery

`claimNextDueForDeletion` selects:

- `PENDING_DELETION` due
- `DELETION_FAILED` with `deletion_next_attempt_at <= now`
- `DELETING` with `deletion_lease_expires_at < now`

Every purge stage renews the lease. `markDeleted` / `markDeletionFailed` require matching `deletion_lease_owner`.

## Purge stages

1. `STORAGE_DISCOVERY`
2. `STORAGE_DELETE` — retries `PENDING` and `FAILED`; fails if keys exist and GCS is not configured
3. `OPERATIONAL_DATA_DELETE` — set-based SQL transaction
4. `IDENTITY_CONFIG_DELETE` — set-based SQL transaction
5. `VERIFY_EMPTY` — residue checks
6. `TOMBSTONE` → `DELETED`
7. `COMPLETED`

Company is never marked `DELETED` while any `company_pending_storage_deletions.status <> DELETED`.

## API

```http
POST /api/platform/companies/:companyId/deactivate
POST /api/platform/companies/:companyId/reactivate
GET  /api/platform/companies/:companyId/deletion-status
```

## Migrations

- `079_company_lifecycle_deletion.sql` — base columns/tables (column-level idempotent)
- `080_company_lifecycle_hardening.sql` — stages, backoff, durable events, reclaim index
- Rollbacks abort if lifecycle has been used (do not convert `DELETED` → `INACTIVE`)

## Durable audit

- `company_lifecycle_events` — deactivate/reactivate (transactional)
- `company_deletion_records` — one row per deletion **attempt** (`STARTED`/`FAILED`/`COMPLETED`)
