# Phase 4D — Regression summary (review corrections)

## Previous 4D baseline

| Item | Value |
|------|------:|
| Backend unit files | 354 |
| Backend TAP | 1956 pass / 0 fail |
| Frontend TAP | 837 pass / 0 fail |

## This correction — static unit `it()` delta

| Item | Delta |
|------|------:|
| `sql-server-errors.test.ts` | expanded (exact/prefix/nested/fallback cases) |
| `attendance-duplicate-errors.test.ts` | +legacy inventory / bare / unrelated cases |
| New unit files | 0 |
| Removed | 0 |
| New integration file | `sql-server-errors.duplicate-key.integration.test.ts` (not in unit discovery) |

## Current measured

| Check | Result |
|-------|--------|
| Backend lint | PASS |
| Backend build | PASS |
| Backend `npm test` | **1957** pass / 0 fail / **354** files |
| Targeted unit (sql + attendance helpers) | **13** pass / 0 fail |
| SQL integration (`UQ_companies_name`) | **PASS** (1 pass / 0 fail) |
| Frontend `npm test` | (see corrections tests artifact) |

Arithmetic: unit file count unchanged (354); TAP +1 vs prior 4D baseline under force-exit noise; no unexplained reduction.
