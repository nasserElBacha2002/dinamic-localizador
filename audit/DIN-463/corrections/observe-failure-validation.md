# OBSERVE failure handling (DIN-463 corrections)

## Rules implemented

| Mode | Lock / eval technical failure | Capacity exceed |
|------|-------------------------------|-----------------|
| DISABLED | N/A (no evaluation) | N/A |
| OBSERVE | `shouldBlockMutation = false`; decision `EVALUATION_ERROR` with reason | `WOULD_EXCEED`; mutation allowed |
| ENFORCE | `shouldBlockMutation = true`; HTTP 503 | `REJECTED`; HTTP 409 |

Lock acquisition tolerates timeout/deadlock in OBSERVE (`tryAcquireCommercialSeatLock`).

Failed observation does not leave an open transaction in an aborted state: employee service rolls back on throw; ledger flush runs after rollback via `insertAutonomous` (separate connection).

## Automated verification

| Command | Result |
|---------|--------|
| `npx tsx --test src/utils/billing/resolve-effective-commercial-seat-mode.test.ts` | 2 pass |
| OBSERVE integration scenarios | **not executed** (integration suite skipped) |