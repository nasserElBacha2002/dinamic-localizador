# Migration validation

**Forward:** `database/migrations/175_commercial_seat_quota.sql`

- Adds nullable `company_settings.commercial_seat_quota_mode` with CHECK.
- Creates `commercial_seat_quota_events` append-only ledger.

**Rollback:** `database/migrations/rollback/175_commercial_seat_quota_rollback.sql`

**Compatibility:** additive; existing companies keep NULL company mode (inherit matrix).

**Not applied** in this execution environment — apply via `npm run migrate` before integration tests.