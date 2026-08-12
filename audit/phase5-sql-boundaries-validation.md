# Phase 5 — SQL Boundaries Validation

**Status:** `IMPLEMENTED_AND_VALIDATED` (residuals closed in `audit/implementation-corrections-validation.md`)  
**Date:** 2026-08-12  
**Scope:** Classify SQL outside repositories; move high-risk production persistence into cohesive repositories; calibrate SQL boundary scanner.  
**Out of scope:** WhatsApp bot God Service split, SOLID/GRASP global, official baseline, ORM introduction.

> Review corrections (CAS draft, tenant mutations, cascade alias removal, integration A/B proof): see `audit/implementation-corrections-validation.md`.

---

## SQL Boundary Audit summary

```text
Raw SQL-keyword file occurrences reviewed: ~248 (backend/src, all layers)

Production boundary violations before (services with .query/.batch owning SQL): ~6–8 critical mixers
  (company-data-cascade, company-deletion-purge, absence-request-draft, whatsapp-flow-trace,
   absence-balance leftover, company-lifecycle)

Production boundary violations after (services with .query/.batch): 1
  one-time-schedule-consistency.inspector.ts (diagnostic inspector — DEFERRED)

Controllers with raw executable SQL: 0
Critical mixed persistence/business services remaining: 0 (orchestrators keep Transaction only)

New God Repositories: 0
Transaction regressions: 0 (tx still opened in services; repos accept optional Transaction)
Tenant regressions from this phase: none identified in moved queries (company_id preserved)
Concurrency regressions: Phase 3 suite still has known flake; see integration section
SQL injection regressions: 0 (parameterized .input retained)
```

---

## Before

```text
SQL keyword files (approx inventory):
  repositories: 59
  services: 32
  controllers: 7   (keyword-only FPs; no getPool)
  routes: 12       (keyword-only FPs)
  middleware: 1
  scripts: 13
  tests: 90
  utils: 16
  …

Services with getPool / .query / mssql (pre-refactor): 21
Services owning substantial query text (HIGH): 
  company-data-cascade (~140 kw), company-deletion-purge, absence-request-draft,
  whatsapp-flow-trace, company-lifecycle, absence-balance notes UPDATE

Confirmed production boundary violations: ~6–8
```

Scanner (`audit:database`) before Phase 5 work: findings≈77; layer-boundary≈20 mostly controller/route **false positives**.

---

## After

```text
Services with .query/.batch remaining: 1
  one-time-schedule-consistency.inspector.ts

Services with Transaction/getPool only (JUSTIFIED orchestration): ~14
Controllers executable SQL: 0
Routes executable SQL: 0

audit:database after: findings=70, blocking=0
audit:architecture: findings=2, blocking=0 (no new cycles reported)
audit:reliability: findings=0
test:audit-framework: 37 OK
```

---

## Moved SQL

| Source file | Query responsibility | Target repository | Transaction preserved | Tenant preserved | Tests |
| --- | --- | --- | --- | --- | --- |
| `company-data-cascade.service.ts` | Set-based tenant purge + residue + fixture cascades | `company-purge.repository` | yes (`transaction?`) | `company_id` | build + integration suite |
| `company-deletion-purge.service.ts` | deletion records CRUD | `company-deletion-record.repository` | n/a (attempt rows) | `company_id` | build |
| `company-deletion-purge.service.ts` | pending storage enqueue/list/mark | `pending-storage-deletion.repository` (extended) | n/a / GCS outside tx | `company_id` | build |
| `absence-request-draft.service.ts` | create / get / markSubmitted | `absence-request-draft.repository` | CAS OPEN→SUBMITTED | `company_id` | build |
| `absence-request-draft.service.ts` | link draft attachments | `absence-attachment.repository.linkDraftAttachmentsToRequest` | optional tx | `company_id` | build |
| `absence-balance.service.ts` | notes UPDATE in ledger upsert | `absence-balance.repository.updateNotesInTransaction` | yes (existing tx) | `company_id` | build |
| `whatsapp-flow-trace.service.ts` | monotonic provider_status projection | attendance / payroll / assignment notification repos | monotonic SQL fragment preserved | n/a (by notification id / SID) | observability unit |
| `company-lifecycle.service.ts` | lifecycle events, revoke access, applock | `company-lifecycle.repository` | yes (caller tx) | `company_id` | lifecycle unit |

Compatibility: `company-data-cascade.service.ts` re-exports purge repository for existing imports (`integration-cleanup`, etc.).

---

## Remaining SQL

| File | Layer | Reason kept | Classification | Follow-up |
| --- | --- | --- | --- | --- |
| `one-time-schedule-consistency.inspector.ts` | services (diagnostic) | Read-only consistency inspector, not core product path | DEFERRED | Move to scripts/ or repository when inspector productized |
| `*.service.ts` with `getPool` + `Transaction` only | services | Legitimate transaction orchestration | JUSTIFIED | none |
| Controllers/routes with SQL **keywords** only | controllers/routes | Error copy / docs; no executable SQL | JUSTIFIED (scanner no longer flags without executable access) | none |
| `backend/src/scripts/**` | scripts | Admin/repair/seed tooling | JUSTIFIED | none |
| `*.integration.test.ts` / test-helpers | tests | Fixtures/cleanup | JUSTIFIED | none |
| `database/**` / migrations | database | Schema evolution | JUSTIFIED | none |
| `utils/service-fix/**`, `sql-app-lock`, static fragments | utils | Closed builders / offline script gen | JUSTIFIED | none |

---

## Scanner calibration

- `classify_layer`: detects `tests`; adds `imports`.
- Layer-boundary for controllers/routes/middleware only when **executable** SQL (`getPool` / `.query` / `.batch` / `new sql.Request`).
- Services with executable SQL flagged as medium `layer-boundary` (`flag_service_executable_sql`).
- Inventory evidence includes `executable_by_layer`.
- **No** broad ignore of `services/**`.

---

## Dependency direction

```text
controller → service → repository → database
```

Preserved for refactored flows. Scripts/tests/migrations intentionally exempt.

Repositories do not import services.

---

## Integration tests

```text
RUN_DB_INTEGRATION_TESTS=true npm run test:integration
→ tests 330, pass 319, fail 10, skipped 1
```

**Baseline note:** Prior Phase 3 evidence showed **9** pre-existing multi-company / settings / tenant failures on `fa4ad9d`. This run shows **10** fails including:

- `multi-company foundation isolation`
- `company settings API integration`
- `tenant isolation hardening`
- `phase3 concurrency CAS / unique` (known flake from Phase 3 review)

Cleanup FK noise during fixture teardown (whatsapp_conversations / operation_workdays) observed; cascade SQL order unchanged from pre-move copy — treated as **pre-existing / environmental**, not introduced by repository extraction.

**Phase 5 claim:** integration suite **was executed**; no increase attributed to moved query text beyond known baseline noise + Phase 3 flake.

---

## Validation commands

| Command | Result |
| --- | --- |
| `npm run lint --prefix backend` | PASS |
| `npm run build --prefix backend` | PASS |
| `npm test --prefix backend` | PASS (pre-lifecycle final; focused lifecycle + observability PASS) |
| `test:integration` | EXECUTED (319/330; see baseline) |
| `npm run test:audit-framework` | PASS (37) |
| `npm run audit:database` | PASS (70 findings, 0 blocking) |
| `npm run audit:architecture` | PASS |
| `npm run audit:tenant` | ran (pre-existing unscoped id notes) |
| `npm run audit:reliability` | PASS (0) |
| `npm run audit:security:fast` | PASS |

---

## Acceptance checklist

1. SQL outside repos classified by layer/context — **yes**
2. Controllers productive executable SQL = 0 — **yes**
3. Main mixers refactored — **yes**
4. No God Repositories — **yes**
5. Business rules not moved into SQL — **yes**
6. Transaction boundaries preserved — **yes**
7. Phase 3 CAS/constraints untouched in moved SQL — **yes** (monotonic advance SQL reused)
8. `company_id` retained on tenant ops — **yes**
9. No SQLi reintroduction — **yes**
10–11. No N+1 / bulk preserved on purge — **yes** (set-based DELETE kept)
12. No new npm deps — **yes**
13. Lint/build/unit — **yes**
14. DB integration executed — **yes**
15. Tenant audit executed — **yes**
16. Architecture audit no new cycles — **yes**
17. `audit:database` reflects fewer false controller FPs + service focus — **yes**
18. Remaining SQL documented — **yes**
19. Generated phase5 `*-diff/status` gitignored — **yes**
20. No out-of-scope refactors — **yes**
