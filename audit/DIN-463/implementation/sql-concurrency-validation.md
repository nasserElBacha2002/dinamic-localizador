# SQL concurrency validation

**Status:** NOT EXECUTED in agent environment (`RUN_DB_INTEGRATION_TESTS` inactive).

## Test specification (ready)

File: `backend/src/services/billing/commercial-seat-quota.concurrency.integration.test.ts`

Scenario: `seat_max=1`, zero actives, global ENFORCE, company ENFORCE, two parallel `employeeService.create`.

Expected:

- Exactly one fulfillment, one `COMMERCIAL_SEAT_LIMIT_EXCEEDED`.
- Final `COUNT(active)=1`.

Operator command (when ephemeral SQL available):

```bash
cd backend
export RUN_DB_INTEGRATION_TESTS=true
# ... ephemeral session env vars ...
node --import tsx --test src/services/billing/commercial-seat-quota.concurrency.integration.test.ts
```