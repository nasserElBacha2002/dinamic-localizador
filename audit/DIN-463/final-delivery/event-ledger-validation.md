# Event ledger validation — DIN-463 final

## Executed (SQL assertions)

| Assert | Status | Evidence |
|--------|--------|----------|
| `REJECTED` + `SEAT_LIMIT_EXCEEDED` + `mutation_persisted=false` | **PASS** | `commercial-seat-quota.integration.test.ts` |
| `NO_VIGENT_SUBSCRIPTION` (INCONSISTENCY path) | **PASS** | policy integration test #2 |

## NOT_EXECUTED (ledger matrix)

| decision / field | Status |
|------------------|--------|
| ALLOWED | NOT_EXECUTED dedicated |
| WOULD_EXCEED | NOT_EXECUTED |
| SKIPPED / COMMERCIAL_EXEMPTION | NOT_EXECUTED |
| INCONSISTENCY variants beyond NO_VIGENT_SUBSCRIPTION | NOT_EXECUTED |
| EVALUATION_ERROR + prep-specific reason codes | NOT_EXECUTED |
| `active_count_before` / `projected_count` accuracy | NOT_EXECUTED |
| `capacity_kind` per scenario | NOT_EXECUTED |
| `actor_user_id` / correlation | NOT_EXECUTED |
| Duplicate event per evaluation | NOT_EXECUTED |
| No invented values on incomplete evaluation | NOT_EXECUTED |

## Documented limitation

Autonomous ledger insert after commit/rollback remains best-effort (no outbox); unchanged in this pass.