# Migration validation — round 3

## Decision

- **175** consolidated final schema: `capacity_kind`, nullable `is_exempt` / `enforce_seat_limit`, filtered index `IX_employees_company_active_quota`, symmetric rollback index drop.
- **176 removed** (redundant with consolidated 175; never required if 175 not applied in persistence).

## SQL integration

Migration apply on ephemeral DB **not executed** in this pass (provision blocked).

## Operational rollback

Disable via `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE=DISABLED`; do not delete ledger history routinely.