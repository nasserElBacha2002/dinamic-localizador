# Transaction & locking validation (DIN-463 corrections)

## Documented lock order (employee mutations)

1. `commercialSeatCompanyLockResource(companyId)` — via `prepareCommercialSeatAdmission` on reactivate, or inside `evaluateActiveHeadcountAdmissionInTransaction` on create/import.
2. `companyUserEmployeeLinkLockResource` — charge-holder updates only.
3. Employee row `UPDLOCK` — `employeeDeactivationRepository.lockEmployeeForUpdate`.

Billing subscription admin locks (`billingSubscriptionCompanyLockResource`) are not taken inside employee transactions.

## Implementation evidence

- `backend/src/services/billing/commercial-seat-quota.service.ts` — header comment + `prepareCommercialSeatAdmission` / `lockPrepared` on evaluate.
- `backend/src/services/employees/employee.service.ts` — `prepareCommercialSeatAdmission` before link/employee locks when `mayReactivate`.

## Automated verification

| Command | Result |
|---------|--------|
| `cd backend && npm run build` | pass |
| `commercial-seat-quota.concurrency.integration.test.ts` | **skipped** — ephemeral SQL session not provisioned (`DINAMIC_TEST_SQL_ACTIVE`, `TEST_DB_*`, `din_test_*` DB required) |

## Residual risk

Concurrent ENFORCE scenarios (last seat, simultaneous import) need `npm run test:integration` with disposable SQL evidence.