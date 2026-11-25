# Connection pool validation (DIN-463 corrections)

## Audit

- Admission policy, subscription, term, settings, and active count reads use the employee transaction connection (`sql.Request(transaction)` patterns in repositories).
- Ledger inserts use `commercialSeatQuotaEventRepository.insertAutonomous` → `getPool()` **after** employee transaction commit/rollback.
- Settings updates use a dedicated short transaction (not nested in employee txs).

## Automated verification

| Check | Result |
|-------|--------|
| Static review of `commercial-seat-quota.service.ts` + `employee.service.ts` | no `getPool()` inside admission evaluate path |
| Pool stress / concurrent ops test | **not executed** |

## Residual risk

High concurrency under pool limits should be validated with integration harness (`test:integration`) and a constrained `DB_POOL_MAX` if exposed.