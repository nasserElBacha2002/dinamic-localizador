# SQL concurrency validation (DIN-463 corrections)

## Target scenarios (spec §10)

Defined in `commercial-seat-quota.concurrency.integration.test.ts` (last-seat race, etc.).

## Execution

| Command | Exit | Notes |
|---------|------|-------|
| `RUN_DB_INTEGRATION_TESTS=true npx tsx --import ./src/test-helpers/preload-test-env.ts --test src/services/billing/commercial-seat-quota.integration.test.ts` | 0 | suite **skipped** — missing `DINAMIC_TEST_SQL_ACTIVE` + ephemeral `din_test_*` DB |
| `commercial-seat-quota.concurrency.integration.test.ts` | — | not run (same guard) |
| Full `npm run test:integration` | **not attempted** — requires `TEST_DB_*` + disposable ack |

## Impact

Cannot claim ENFORCE concurrent safety or deadlock recovery as validated until integration runner provisions SQL and migration 175 is applied.