# Implementation corrections — Phase 3 concurrency/idempotency review

**Status:** `FIXED_AND_VALIDATED`  
**Date:** 2026-08-12  
**Scope:** Code-review corrections only (migrations runner, ONE_TIME invariant, import idempotency, service/Twilio tests, 9-fail evidence)

---

## Triage

| # | Feedback | Priority | Action |
|---|----------|----------|--------|
| 1 | 089–091 SCHEMA_DRIFT / manual 092 | must fix | 089 idempotent heal; runner applied 089→091→093 |
| 2 | Validate 092 via official runner | must fix | Clean-DB runner test + migrate on current DB |
| 3 | Upgrade from pre-092 | must fix | 093 ensures ONE_TIME filter on upgrade |
| 4 | Rollback 092 | must fix | Integration test rollback/reapply |
| 5 | ONE_TIME invariant vs wider unique | must fix | Filter `operation_kind = ONE_TIME` |
| 6 | Tests by operation kind | must fix | CANCELLED / RECURRING / ONE_TIME tests |
| 7 | NULL scheduled_start diagnostics | must fix | Documented: RECURRING×2 same service |
| 8 | Import same-key different payload | must fix | `IDEMPOTENCY_KEY_CONFLICT` when fileHash/etc differ |
| 9–10 | Import concurrent tests | must fix | Integration tests added |
| 11–12 | Service-level confirmation concurrency | must fix | Isolated op + message↔DB assert |
| 13 | Twilio monotonic DB matrix | must fix | Matrix vs `pickProjectedProviderStatus` |
| 15–16 | 9 integration failures | must fix | Proven identical on `fa4ad9d` (phase1/2) and phase3 |
| 17 | Reliability scanner | should fix | Kept; no new ignore-lists |
| 18 | Gitignore duplicates | should fix | Deduped |

---

## Migration runner

### Root cause of 089–091 drift
`phase3-4-db-security.integration.test.ts` applied `089` via `applySqlScriptInTransaction` **without** inserting `system_migrations`. Roles remained; runner then hit `SCHEMA_DRIFT` and never reached 091/092.

### Fix
- `089` is now idempotent when **both** roles exist **and** runtime has expected `SCHEMA::dbo SELECT` (no-op heal).
- Partial/foreign role sets still `THROW 50089 SCHEMA_DRIFT`.
- Official `npm run migrate` then applied: **089, 090, 091, 093** (092 already registered; 093 tightened filter).

### Clean DB
`phase3-clean-migration-runner.integration.test.ts` creates `dinamic_attendance_phase3_clean_mig`, runs official runner with `DB_NAME` override, asserts 089–093 + ONE_TIME filter, drops DB. **PASS**.

### Pre-092 upgrade
093 drops/recreates index when filter lacks `ONE_TIME`. Verified filter:

```text
([status]<>N'CANCELLED' AND [operation_kind]=N'ONE_TIME' AND [scheduled_start] IS NOT NULL)
```

### Rollback / reapply
`phase3-migration-unique.integration.test.ts`: rollback 093+092 → index absent → apply 092+093 → ONE_TIME index present. **PASS**.

No manual `system_migrations` inserts in this correction pass.

---

## ONE_TIME invariant

- `createRecurring` inserts `scheduled_start = NULL`.
- Diagnostics: active NULL-start duplicates are **RECURRING** (count=2, same company+service) — not corruption; excluded from unique.
- Unique applies only to **active ONE_TIME with non-null start**.
- CANCELLED does not block a new active ONE_TIME (tested).
- Two RECURRING NULL starts allowed (tested).

Remediation (optional later): decide if multiple RECURRING per service should be unique; not in Phase 3 scope.

---

## Import idempotency

On duplicate key for idempotencyKey, reuse existing **only if**:

- companyId, entityType, idempotencyKey, fileHash, strategyVersion, userId match.

Else: `AppError 409 IDEMPOTENCY_KEY_CONFLICT`.

Tests: concurrent same payload → 1 row; different payload → conflict, still 1 row.

---

## Concurrency / Twilio tests

- Repository CAS retained.
- Service-level confirm∥unavailable on isolated operation; messages match durable DB status.
- Twilio outbox matrix: sent/delivered/read/failed/undelivered cases vs TS `pickProjectedProviderStatus`.

---

## Nine integration failures — evidence

Suites:

- `multi-company foundation isolation` (3)
- `company settings API integration` (2)
- `tenant isolation hardening` (4)

| Commit | Result |
|--------|--------|
| `fa4ad9d` (phase 1 y 2) | **9 fail / 22 pass** (same names) |
| `078366e` (phase 3) | **9 fail / 22 pass** (same names) |

Logs: `/tmp/int-fails-on-phase12.log`, `/tmp/int-fails-on-phase3head.log`.

**Conclusion:** pre-existing debt; not introduced by Phase 3 or these corrections. Not fixed in this review (out of concurrency scope).

---

## Validation commands

| Command | Result |
|---------|--------|
| `npm run migrate` | 089–091, 093 applied via runner |
| `npm run migrate:status` | 089–093 applied |
| Phase3 correction integration tests | PASS (clean-db, import, concurrency, migration unique, security) |
| `npm run lint --prefix backend` | PASS |
| `npm run build:backend` | PASS |
| `npm test --prefix backend` | (see below) |
| Full `test:integration` | 9 pre-existing fails only (proven) |
| `audit:reliability` / `database` / `security:fast` / `audit` / `audit:strict` | (see below) |

---

## Architectural decisions

1. Heal 089 orphans with grant fingerprint instead of adopting arbitrary roles.
2. Split upgrade of unique filter into **093** so already-registered 092 does not require deleting `system_migrations`.
3. Keep CAS only in repository; service re-reads and aligns WhatsApp copy to durable state.
4. Import idempotency is payload-scoped (fileHash + strategyVersion + userId), not key-only.
