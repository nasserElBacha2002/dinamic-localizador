# Phase 5 SQL Boundaries — Implementation Corrections Validation

**Status:** `FIXED_AND_VALIDATED`  
**Date:** 2026-08-12  
**Base SHA (pre–Phase 5):** `11aa51e` (phase 4)  
**Current:** working tree (Phase 5 + corrections; uncommitted)

---

## Root causes addressed

1. **Integration “10th failure”** — A/B on the same DB/env showed **10 leaf failures on base `11aa51e` already**. The extra Phase 5 narrative failure was the known Phase 3 suite flake `service-level confirm || unavailable…`, present on both SHAs. Evidence: isolated 10× runs (base 5/10 fail, current 2/10 fail) with identical assertion error before fix.
2. **Phase 3 flake root cause** — Test required *both* concurrent response messages to match the durable DB winner. CAS correctly leaves one durable status; the loser still returns `ok` with its own copy. Fixed assertion (no sleeps). After fix: **10/10 PASS**.
3. **Draft submit ignored CAS `rowsAffected`** — Winner path now requires `affected === 1`; on 0 re-reads durable draft (idempotent replay / idempotency conflict / cancelled / expired / not found). Attachments link only after CAS win (SQL also guards `submitted_request_id`).
4. **Orphan requests** — Submit holds `UPDLOCK` on OPEN draft before `createFromAdmin`; CAS update runs in the same lock transaction. Lost/aborted creates cancel PENDING orphans. Invariant: `draftId → ≤1 durable request` via `submitted_request_id`.
5. **Pending storage / deletion records** — Mutations now require `company_id` (+ lease where applicable) and return `rowsAffected`.
6. **Compatibility alias** — Removed `company-data-cascade.service.ts`; fixture cascades moved to `test-helpers/integration-entity-cascade.ts`; production purge stays set-based in `company-purge.repository.ts`.
7. **Tenant audit noise** — Missing legacy route filenames updated; mutation `WHERE id=@id` scanner tightened; WhatsApp message UPDATEs tenant-scoped; global UUID SELECTs classified `SAFE_GLOBAL_ID`.
8. **Raw tenant report** — `audit/tenant-isolation-audit.txt` gitignored / untracked.

---

## Integration pre/post comparison

| | PRE-PHASE5 (`11aa51e`) | POST-CORRECTION (current) |
| --- | --- | --- |
| tests | 330 | 338 |
| pass | 319 | 328 |
| fail | 10 | 9 |
| skip | 1 | 1 |

**New failures attributable to Phase 5: 0**

Pre-existing leaf failures (same 9 on both; Phase 3 flake removed on current):

- multi-company foundation isolation (3)
- company settings API integration (2)
- tenant isolation hardening (4)

Phase 3 leaf that failed on base and was fixed on current:

- `service-level confirm || unavailable: one durable state, messages match DB`

Added passing suites on current: draft CAS concurrency (5), purge equivalence (2), lifecycle deactivate (1).

### A/B Phase 3 isolated evidence

| SHA | runs | pass | fail | signature |
| --- | --- | --- | --- | --- |
| `11aa51e` | 10 | 5 | 5 | AssertionError: both messages must match winner regex |
| current (before assertion fix) | 10 | 8 | 2 | same |
| current (after assertion fix) | 10 | 10 | 0 | — |

---

## CAS draft correction

- `markSubmittedIfOpen(..., transaction?)` returns rowsAffected; service requires `=== 1`.
- Lock-open → create → CAS-in-lock-tx → commit → link attachments.
- `linkDraftAttachmentsToRequest` requires draft `SUBMITTED` with matching `submitted_request_id`.
- Concurrent SQL tests cover same key, different keys, submit∥cancel, submit∥expire, attachment binding.

---

## Tenant audit triage

| Finding | Classification | Action |
| --- | --- | --- |
| `whatsapp-message` UPDATE `WHERE id=@id` | CONFIRMED | Added `company_id` to updates; callers pass tenant from message row |
| `whatsapp-message` SELECT by id (Twilio SID bootstrap) | SAFE_GLOBAL_ID | `findByIdGlobal` for correlation before tenant known |
| `whatsapp-observability` message detail SELECT | SAFE_GLOBAL_ID / TENANT_SCOPED_UPSTREAM | Delegates to `findByIdGlobal`; platform UI is UUID lookup |
| missing `store/inventory*.routes.ts` | STALE_AUDIT_RULE | Auditor list → `service/operation/operation-assignment.routes.ts` |
| pending storage mark by id only | CONFIRMED | Fixed `markDeleted/markFailed(companyId, …)` |
| deletion record stage/fail by id only | CONFIRMED | Homogenized with `company_id` (+ lease on fail/complete) |

`npm run audit:tenant` → exit 0 (No findings).

---

## Purge / lifecycle / provider

- Purge equivalence integration: operational delete, identity stage, pending storage retained then marked, other company untouched, txn rollback.
- Lifecycle deactivate DB: applock path, invitation revoke, bot session expire, lifecycle event.
- Phase 3 Twilio monotonic matrix still passes in suite.

---

## Quality gates

| Command | Result |
| --- | --- |
| `npm run lint --prefix backend` | PASS |
| `npm run build --prefix backend` | PASS |
| `npm test --prefix backend` | PASS (1296) |
| `RUN_DB_INTEGRATION_TESTS=true npm run test:integration` | 328 pass / 9 fail (pre-existing) / 1 skip |
| `npm run test:audit-framework` | PASS (43) |
| `npm run audit:database` | findings=60 blocking=0 passed |
| `npm run audit:tenant` | 0 findings |
| `npm run audit:architecture` | findings=2 blocking=0 |
| `npm run audit:reliability` | findings=0 |
| `npm run audit:security:fast` | secrets=0 (completed) |
| `npm run audit` / `audit:strict` | PASS (blocking=0; Quality gate PASSED) |

---

## Files deleted / renamed

- **Deleted:** `backend/src/services/company-data-cascade.service.ts`
- **Added:** `backend/src/test-helpers/integration-entity-cascade.ts` (fixture cascades)
- **Untracked/gitignored:** `audit/tenant-isolation-audit.txt`

---

## Remaining debt

- 9 pre-existing company isolation / settings / tenant route integration failures (unchanged vs base).
- Diagnostic service SQL still deferred: `one-time-schedule-consistency.inspector.ts`.
- `fromDraftId` option on `createFromAdmin` remains unused; durable binding is draft CAS + lock (document if a future unique `draft_id` column is desired).
