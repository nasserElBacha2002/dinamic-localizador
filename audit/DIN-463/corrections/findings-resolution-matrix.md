# DIN-463 — Adversarial review findings resolution (corrections pass)

**Status:** `IMPLEMENTED_PENDING_VALIDATION` (integration matrix not fully executed in this pass).

| ID | Severity | Finding | Action | Files | Verified |
|----|----------|---------|--------|-------|----------|
| P1-01 | P1 | Contractual reads outside admission transaction | Policy/subscription/term reads via `getCompanyBillingPolicyInTransaction`, `findVigentByCompanyIdInTransaction`, `findActiveAtInTransaction`; count in tx | `commercial-seat-quota.service.ts`, billing repos/policy | build |
| P1-02 | P1 | Lock order inversion on reactivate | Documented hierarchy; `prepareCommercialSeatAdmission` before link/employee locks on reactivate | `commercial-seat-quota.service.ts`, `employee.service.ts` | build / concurrency tests pending SQL |
| P1-03 | P1 | OBSERVE blocking on observability failures | OBSERVE: no `shouldBlockMutation` on lock/eval errors; ENFORCE blocks technical failures | `commercial-seat-quota.service.ts` | unit matrix / integration pending |
| P1-04 | P1 | `recordPersistedAdmission` disconnected | Removed; typed `CommercialSeatAdmissionEvaluation`; `flushAdmissionEvaluation` post-commit/rollback | service, employee.service, event repo | build |
| P1-05 | P1 | Pool use inside open employee tx | Events via `insertAutonomous` after tx; billing reads on same `sql.Transaction` | event repo, service | static audit |
| P1-06 | P1 | Settings update races / ENFORCE bypass | Transactional UPDLOCK update + audit; reject company ENFORCE unless global ENFORCE | `commercial-seat-quota-settings.service.ts`, `company-settings.repository.ts` | build |
| P1-07 | P1 | `seed-employees` MERGE bypass | Script uses `employeeService` + required `SEED_COMPANY_ID`; legacy flags removed | `seed-employees.ts` | build / manual script pending |
| P2-01 | P2 | Event ledger fiction | Nullable counts; `mutationPersisted` flag; real evaluation context | migration 175, types, service | build |
| P2-02 | P2 | Reject events after rollback | `flushCommercialSeatAdmission(..., false)` on employee paths | `employee.service.ts` | integration pending |
| P2-03 | P2 | Migration / index | Nullable ledger counts; filtered index `IX_employees_company_active_quota` | `175_commercial_seat_quota.sql` | migration pending local SQL |
| P2-04 | P2 | Real SQL validation | Tests fixed (`env` not `process.env`, UUID phones); full matrix not run | integration tests | pending `test:integration` |
| P2-05 | P2 | Performance count | Filtered index on `(company_id, active) WHERE active = 1` | migration 175 | explain pending |
| P3-01 | P3 | Docs / hygiene | See `final-report.md`; corrections evidence under `audit/DIN-463/corrections/` | audit | partial |
| P3-02 | P3 | Unknown capacity representation | `activeCountBefore` / `projectedCount` nullable; `capacityKind` | types, service | build |

**Deferred / residual**

- Full adversarial integration matrix (concurrency, OBSERVE failures, HTTP security) requires `npm run test:integration` against disposable SQL with migration 175 applied.
- Architecture test for direct `employees` writers not added (optional per spec).