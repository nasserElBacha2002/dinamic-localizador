# Database Integrity Phase 1 — Corrections Report

## Executive Summary

Estado: **COMPLETE**

Phase 1 tenant composite FKs are preserved. Review blockers were fixed:

1. Migration runner now applies each file in one TDS transaction (`SET XACT_ABORT ON` + commit/rollback).
2. `work_team_members` uses expand (087) / contract (088) for rolling deploy compatibility.
3. Schema-drift preflights, FK metadata tests, failure injection, and forward→rollback→forward coverage added.
4. No Phase 2 work. No new triggers/SPs. Payroll 082–084 and workday 039 composites left intact.

---

## Migration runner audit

| Topic | Finding |
|-------|---------|
| Connection/session | Shared `mssql` pool; each migration opens `sql.Transaction(pool)` (TDS-level BEGIN/COMMIT). |
| GO splitting | `splitBatches()` on `\nGO\n` (case-insensitive). |
| Pre-fix behavior | Each GO batch used `pool.request().query()` → **autocommit**. Mid-file failure left partial DDL; `system_migrations` not inserted. |
| Current behavior | All batches of one file run inside one transaction; register `system_migrations` inside the same TX; rollback on error. |
| Import side effect | Fixed: CLI (`runMigrations` / `--status`) only runs when argv entry is `run-migrations.ts` (imports no longer auto-migrate). |
| T-SQL `BEGIN TRAN` in a separate batch | **Rejected**: triggers error 266 with this driver (“Transaction count after EXECUTE…”). |

---

## Atomicity strategy

```
preflight (in migration SQL)
→ sql.Transaction.begin()
→ SET XACT_ABORT ON
→ for each GO batch: Request(transaction).query(...)
→ INSERT system_migrations (same TX)
→ COMMIT
on error → ROLLBACK (ignore if server already aborted)
```

Proven by integration tests:

- CREATE TABLE + INSERT + THROW → table absent after failure.
- DROP composite FK + THROW → FK still present after failure.

---

## Failure-injection result

| Scenario | Result |
|----------|--------|
| Probe table mid-script THROW | Schema unchanged (table not left behind) |
| DROP `FK_attendance_records_employee_company` then THROW | FK restored (no hybrid state) |

Unacceptable hybrid state (some legacy FKs dropped, some composites missing) was **not** observed after these tests.

---

## work_team_members deployment compatibility

**Deploy model (evidence):** `.github/scripts/deploy-backend.sh` runs migrations **while the previous backend container is still up**, then builds/restarts backend.

Therefore old writers and migrated DB **can coexist**.

| Step | Migration | Schema | Old backend INSERT without `company_id` |
|------|-----------|--------|----------------------------------------|
| Release A | 087 expand | `company_id` **NULLABLE** + backfill | **Works** |
| Release A | backend deploy | writers send `company_id` | — |
| Release B | 088 contract | `company_id` **NOT NULL** + member composites | Would fail if old writers still live — **do not ship 088 with 087 in the same release** unless all writers already send `company_id` |

Comment added in `deploy-backend.sh` pointing to this report.

---

## Migration split/decision

| File | Decision |
|------|----------|
| `087_phase1_tenant_composite_fks.sql` | **Edited in place** — only applied locally / not shared production. Expand-only for members + schema-drift preflight. |
| `088_phase1_work_team_members_contract.sql` | **New** — contract NOT NULL + member composites. Idempotent if an older local 087 already contracted. |

If a shared environment already applied the **old** full 087 (members NOT NULL + composites), do **not** re-edit history there; 088 is a no-op / idempotent contract.

---

## Rollback strategy

- Forward owns Phase 1 constraint/index **names**; schema-drift preflight blocks unexpected absence of legacy **or** composite FKs.
- Rollback uses `IF EXISTS → DROP` only for those Phase 1–owned names, then restores legacy single-column FKs.
- Prefer rollback **088 then 087**.
- 088 rollback drops `IX_work_team_members_company_team` before `ALTER … NULL` (index blocked nullability change).
- 088 forward drops/recreates the same index around `ALTER … NOT NULL`.

---

## Schema drift preconditions

087 Section 0 checks:

- Required tables exist.
- `attendance_records.company_id` type.
- Legacy or already-migrated employee FK on attendance.
- `work_team_members` expand prerequisites.

Data preflights remain **NO HEURISTIC HEAL** (THROW on cross-tenant rows). Only deterministic member backfill from `work_teams`.

---

## Composite FK metadata validation

Helper: `backend/src/test-helpers/composite-fk-metadata.ts`

Asserts via `sys.foreign_keys` / `sys.foreign_key_columns` / `sys.columns`:

- child/parent tables
- column order: `(company_id, foreign_id) → (company_id, id)`

Parent uniques asserted via `sys.indexes` / `sys.index_columns` (not name-only).

---

## Cross-tenant test matrix

| Family | Direct SQL | Expected |
|--------|------------|----------|
| attendance | `attendance_records` employee cross-tenant | 547 |
| operations | `operation_assignments` operation cross-tenant | 547 |
| absence request | type cross-tenant | 547 |
| drafts | employee cross-tenant | 547 |
| attachments | request cross-tenant | 547 |
| balance | employee cross-tenant | 547 |
| bot session | employee cross-tenant | 547 |
| notification | employee cross-tenant | 547 |
| workday ↔ absence | absence_request cross-tenant | 547 |
| work teams | member employee cross-tenant | 547 |

---

## Same-tenant regression matrix

| Case | Expected |
|------|----------|
| `attendance_records` same tenant | success |
| `work_team_members` with `company_id` | success; `company_id` matches team |

---

## Forward/rollback/forward result

| Cycle | Result |
|-------|--------|
| 088 → rollback 088 → 088 | PASS (nullable ↔ NOT NULL + composites) |
| 088 rollback → 087 rollback → 087 → 088 | PASS (legacy FKs restored, then composites restored) |

---

## Work team repository (item 15)

**NO_CHANGE** for `removeMemberInTransaction` / `memberExists` signatures.

Rationale: `work_team_id` is globally unique PK; service paths use `getById(companyId, …)`; inserts already require `companyId`; composite FKs enforce tenant on write. Adding `companyId` to delete/exists would be cosmetic without new callers needing it.

---

## Validation commands + results

| Command | Result |
|---------|--------|
| `npm run build` | pass |
| `npx eslint` (changed files) | pass |
| `npm run lint` (full) | pre-existing errors elsewhere (unchanged by this work) |
| `npm run migrate` | pass (088 applied) |
| `npm run migrate:status` | 087+088 applied |
| `npm test` (unit) | pass |
| Phase1 + safety integration (`RUN_DB_INTEGRATION_TESTS=true`) | **23/23 pass** |

---

## Remaining issues

- Full-repo `npm run lint` still reports pre-existing issues unrelated to Phase 1.
- Shared environments that already applied the **pre-correction** 087 must treat 087 source edits as documentation-only for that environment; rely on 088 idempotency.
- Do not ship 087+088 in one deploy while old backends omit `company_id` on member inserts.

---

## Decisions summary

1. Runner atomicity via mssql `Transaction` (not T-SQL BEGIN in a separate batch).
2. Expand/contract split for members because deploy migrates before backend restart.
3. 087 editable locally; 088 additive contract migration.
4. Rollback ownership = named Phase 1 objects + forward schema-drift guards.
5. Work-team remove/exists API left unchanged (NO_CHANGE).
