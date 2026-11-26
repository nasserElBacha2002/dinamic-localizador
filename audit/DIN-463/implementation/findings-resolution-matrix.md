| Audit ID | Finding | Resolution | Evidence |
|----------|---------|------------|----------|
| H-01 | No centralized enforcement | `commercial-seat-quota.service.ts` + employee hooks | `employee.service.ts` |
| H-02 | Last-seat race | `sp_getapplock` + `countActiveInTransaction` | `commercial-seat-quota.concurrency.integration.test.ts` (requires SQL run) |
| H-03 | Reactivation via PUT | Admission on `active: false → true` | `employee.service.ts` |
| H-04 | Import batch/fallback | Same service on batch and per-row create | `employee.service.ts`, import strategy unchanged semantics |
| H-05 | No capacity without contract | Allow + `INCONSISTENCY` event | `commercial-seat-quota.service.ts` |
| H-06 | seed-employees bypass | Env + `EMPLOYEE_LEGACY_SEED_ALLOWED` guard | `seed-employees.ts` |
| H-07 | Test SQL inserts | Documented limit; prod uses service paths | implementation-report.md |
| H-08 | Lock ordering with billing | Dedicated `commercial-seat` lock; billing lock unchanged | `sql-app-lock.ts` |