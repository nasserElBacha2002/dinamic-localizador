# DIN-463 — findings resolution (round 4 final)

**Status:** `IMPLEMENTED_VALIDATED`

| # | Item | Action | Verified |
|---|------|--------|----------|
| 1 | SQL integration | `din_integration` + disposable DB; DIN-463 subset 6/6 | SQL 2026-11-25 |
| 2 | seed-employees bypass | Script + `seed:employees` removed | build + grep |
| 3 | OBSERVE tx state | `assertTransactionActiveForMutation` (`XACT_STATE()===1`) after soft failures | unit + SQL |
| 4 | Admin settings race | UPDLOCK read in settings tx | build |
| 5 | Idempotent reactivate | `delta=0` after row lock; integration tests ENFORCE/OBSERVE | SQL pass |
| 6 | Migrations 175/176 | 176 removed; 175 canonical | static + provision |
| 7 | Deprecated assert API | Removed `assertActiveHeadcountAdmissionInTransaction` | build |
| 8 | Git hygiene | Large audit diffs gitignored; `din-463-final-*` evidence | done |
| 9 | Rejection ledger flush | Evaluate → mutate → throw; flush after rollback | SQL pass |
| 10 | Fixture cleanup FKs | Cascade deletes quota events + billing before company | SQL pass |

## Not separately executed in this pass

- Full §9 adversarial matrix row-by-row document
- Repo-wide `npm run lint` (pre-existing failures in unrelated modules)
- Production ENFORCE (intentionally off; global default `DISABLED`)