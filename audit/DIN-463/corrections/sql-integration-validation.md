# SQL integration validation (DIN-463 round 4 final)

## Mechanism (DIN-462)

- Runner: `backend/scripts/run-integration-tests.mjs`
- Provisions ephemeral `din_test_<uuid>`, migrates, runs suites, teardown
- Requires `TEST_DB_*` (not `DB_*`), `TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true`, `TEST_SQL_ALLOWED_SERVER_NAME` matching `@@SERVERNAME`

## Local setup used

| Variable | Value |
|----------|--------|
| `TEST_DB_HOST` | `localhost` |
| `TEST_DB_PORT` | `1433` (container `sqlserver`; local `backend/.env` `DB_PORT=1435` targets a different instance) |
| `TEST_DB_USER` | `din_integration` |
| `TEST_SQL_ALLOWED_SERVER_NAME` | `c60449e5dbda` |

## Round 4 results

| Scope | Outcome |
|-------|---------|
| DIN-463 suites (2 files, 6 tests) | **Pass** — ENFORCE/OBSERVE policy, concurrency last-seat, REJECTED ledger, idempotent reactivate |
| Full backend integration (earlier in round 4) | **884 pass / 0 fail** on disposable DB with same login |
| `--files` filter on runner | **Ignored** — use manual provision + `tsx --test` for focused runs |

## Fixture cleanup fix

Integration `after()` hooks failed until `deleteCompanyCascade` deleted `commercial_seat_quota_events` and billing subscription rows before `companies`. Fixed in `integration-entity-cascade.ts`.

## Repeat checklist

1. Configure `TEST_DB_*` in `backend/.env` (see `.env.example` block).
2. Ensure disposable SQL and non-`sa` login with `dbcreator`.
3. Set `TEST_SQL_ALLOWED_SERVER_NAME` from `SELECT @@SERVERNAME`.
4. `cd backend && npm run test:integration` **or** DIN-463 subset script from `din-463-final-tests.txt`.