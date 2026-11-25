# Migration validation (DIN-463 corrections)

## File

`database/migrations/175_commercial_seat_quota.sql`

## Corrections in this pass

- Nullable ledger count columns + relaxed CHECK.
- Filtered index `IX_employees_company_active_quota` on `employees (company_id, active) WHERE active = 1`.

## Execution

| Step | Result |
|------|--------|
| Apply on local SQL via `npm run migrate` | **not executed** in this session (no ephemeral integration provisioning; production DB must not be targeted) |
| Rollback script | present at `rollback/175_commercial_seat_quota_rollback.sql` |

## Operational rollback policy

Recommended production de-risk: set `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE=DISABLED`; do not delete historical ledger rows as routine rollback.