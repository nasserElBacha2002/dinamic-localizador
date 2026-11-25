# DIN-463 — Adversarial corrections final report

**Final status:** `IMPLEMENTED_PENDING_VALIDATION`

## Summary

- Transactional contractual reads and in-tx headcount during admission.
- Lock hierarchy fixed for reactivation (`prepareCommercialSeatAdmission` before employee row lock).
- OBSERVE non-blocking on recoverable control failures; ENFORCE blocks technical uncertainty.
- Event ledger tied to real evaluations via post-tx flush; removed synthetic `recordPersistedAdmission`.
- Settings update transactional with ENFORCE global guard.
- `seed-employees.ts` migrated to `employeeService` + mandatory `SEED_COMPANY_ID`.
- Migration 175: nullable ledger counts + filtered active employee index.

## Not validated in this pass

Full SQL integration matrix, concurrency suite, migration apply on disposable DB, HTTP auth regression, pool-limit stress.

## Effective ENFORCE

Global default remains **DISABLED**; ENFORCE only for isolated test runs mutating `env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE` with ephemeral SQL.

## Files touched (high level)

See `implementation-corrections-diffstat.txt`.

## Next steps for `IMPLEMENTED_VALIDATED`

1. `npm run test:integration` with disposable SQL + migration 175.
2. Execute commercial seat integration + concurrency suites.
3. Optional HTTP tests for platform-admin-only settings.
4. Adversarial re-review of ledger rows under OBSERVE/ENFORCE partial import.