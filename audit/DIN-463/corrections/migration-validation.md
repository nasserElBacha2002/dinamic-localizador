# Migration validation — DIN-463 final

## Schema

- **175** `175_commercial_seat_quota.sql` — canonical (events ledger, `company_settings.commercial_seat_quota_mode`, filtered index `IX_employees_company_active_quota`, symmetric rollback `rollback/175_commercial_seat_quota_rollback.sql`).
- **176** — removed from tree; consolidated into 175 (never applied as separate version in persistent env per audit).

## Ephemeral validation (this pass)

| Step | Evidence |
|------|----------|
| Forward apply on `din_test_*` | `integration-run.log` line `Migration applied: 175_commercial_seat_quota.sql` |
| Commercial seat integration tests | pass under migrated schema |
| Full migration chain | all scripts through latest applied before tests |

## Rollback

Rollback script present; idempotent forward re-apply covered by broader migration integration tests in suite. No schema change in this closure pass.