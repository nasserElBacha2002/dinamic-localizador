# Database Integrity Phase 0A Implementation

**Date:** 2026-08-07  
**Audit source:** `audit/database-integrity-audit.md` (H1–H4 only)

## 1. Executive Summary

**Estado: `COMPLETE_WITH_ISSUES`**

| Finding | Status | Evidence |
|---------|--------|----------|
| H1 Absence overlap concurrency | Done | `sp_getapplock` + SQL concurrent test 1 success / 1 `ABSENCE_OVERLAP` |
| H2 Attendance double review | Done | Migration `086` unique + CAS `reviewed_at IS NULL` + SQL concurrent test |
| H3 Attachment TOCTOU on approve | Done (core) | Assert moved inside `transition` tx with attachment `UPDLOCK` |
| H4 Checkout w/o location atomicity | Done (core) | Session `completeSession(..., transaction)` before commit |

**Issues (non-blocking for core acceptance):**

* H3: no SQL integration reproducing concurrent attachment soft-delete vs approve (unit coverage of tx boundary only).
* H4: no injected-failure integration proving full ROLLBACK of checkout+session; atomicity verified by code structure + existing checkout CAS.

No new triggers or stored procedures.

---

## 2. Archivos modificados

### Added

* `database/migrations/086_attendance_reviews_unique_per_attendance.sql`
* `database/migrations/rollback/086_attendance_reviews_unique_per_attendance_rollback.sql`
* `backend/src/utils/sql-app-lock.ts` (+ `.test.ts`)
* `backend/src/services/database-integrity-phase0a.integration.test.ts`
* `backend/src/services/database-integrity-phase0a-h3.h4.unit.test.ts`
* `audit/database-integrity-phase0a-implementation.md` (this file)
* `audit/database-integrity-phase0a-{status,diffstat,diff}.txt`

### Modified

* `backend/src/services/absence-request.service.ts` — applock before overlap (create + updateNeedsInfo); resubmit assert in-tx
* `backend/src/services/absence-review.service.ts` — attachment assert inside `transition` for APPROVE
* `backend/src/services/attachment-policy.service.ts` — optional transaction; lock request when in-tx
* `backend/src/repositories/absence-attachment.repository.ts` — `UPDLOCK,HOLDLOCK` on count when in-tx
* `backend/src/repositories/attendance.repository.ts` — CAS `reviewed_at IS NULL` + reviewable statuses
* `backend/src/services/attendance.service.ts` — handle CAS miss + unique review violation → 409
* `backend/src/services/whatsapp-bot.service.ts` — complete session inside checkout-without-location transaction

### Deleted

* none

---

## 3. H1 — Absence overlap

**Implementation:** Before `assertNoOverlap` in `createRequest` and `updateNeedsInfo`, acquire:

```text
Resource: absence:{companyId}:{employeeId}  (lowercase)
LockMode: Exclusive
LockOwner: Transaction
LockTimeout: 15000 ms
```

Helper: `acquireTransactionAppLock` / `absenceEmployeeLockResource` in `sql-app-lock.ts`.

**Why applock:** Empty overlap SELECT under READ COMMITTED does not take key-range locks; employee-scoped applock serializes create/edit for the same employee without blocking other employees.

**Timeout:** lockResult < 0 → `409 ABSENCE_LOCK_TIMEOUT`.

**Employee change:** domain edit does not move `employeeId` → single lock key.

**Test:** concurrent overlapping VACATION creates → 1 fulfilled / 1 `ABSENCE_OVERLAP`; DB count of overlapping active rows = 1. Parallel creates for two employees both succeed.

---

## 4. H2 — Attendance review

**Migration `086_attendance_reviews_unique_per_attendance.sql`:**

* Preflight `GROUP BY company_id, attendance_id HAVING COUNT(*) > 1` → THROW (no auto-heal).
* Drop `IX_attendance_reviews_attendance_id`.
* Create `UQ_attendance_reviews_company_attendance` on `(company_id, attendance_id)`.

**CAS:**

```sql
UPDATE attendance_records
SET ... reviewed_at = SYSUTCDATETIME() ...
WHERE id = @attendanceId AND company_id = @companyId
  AND reviewed_at IS NULL
  AND validation_status IN (N'PENDING_REVIEW', N'REJECTED')
```

rowsAffected 0 → `409 ATTENDANCE_ALREADY_REVIEWED`. Duplicate key on reviews → same 409.

**Audit:** still after commit (P2 follow-up from original audit; not expanded here).

**Test:** two concurrent reviewers → 1 success / 1 conflict; `attendance_reviews` count = 1; `reviewed_at` set.

---

## 5. H3 — Absence approval attachments

**Before:** `approve()` called `assertRequiredAttachmentsSatisfied` then `transition()` (separate tx boundary).

**After:** `approve()` only checks existence; `transition()` after `findByIdForUpdate` calls assert with the same transaction; `countAvailable` uses `UPDLOCK,HOLDLOCK` when transactional. `resubmit` also asserts inside its open transaction.

**Locks:**

* absence_requests: existing `UPDLOCK,HOLDLOCK` via `findByIdForUpdate`
* AVAILABLE attachments: UPDLOCK HOLDLOCK during count

**Tests:** unit — approve no longer asserts before `runAfterAbsenceMutation`; assert forwards transaction to countAvailable.

---

## 6. H4 — Checkout without location

**Before:** `registerCheckoutInTransaction` + `commit` then `completeSessionIfNeeded()` outside tx.

**After:** `completeSession(companyId, sessionId, transaction)` before `commit` (same pattern as location checkout). Early exits (no attendance / already checked out / revalidation fail) still complete session outside when no checkout write occurred.

**Idempotency:** unchanged `checkout_at IS NULL` + `UQ_attendance_records_checkout_message_sid`.

**Tests:** structural unit test asserting session completion precedes commit in `processCheckoutWithoutLocation`.

---

## 7. Migraciones

| Field | Value |
|-------|-------|
| Number | 086 |
| Filename | `086_attendance_reviews_unique_per_attendance.sql` |
| Objects | Unique index `UQ_attendance_reviews_company_attendance`; dropped `IX_attendance_reviews_attendance_id` |
| Preflight | Duplicate review rows → THROW 50086 |
| Rollback | Restores non-unique IX |
| Applied locally | `npm run migrate` → exit 0; status shows applied |

H1/H3/H4: no schema changes.

---

## 8. Concurrency tests

| Test | Operaciones concurrentes | Expected | Actual |
|------|--------------------------|----------|--------|
| H1 overlap same employee | 2 createFromAdmin overlapping | 1 OK / 1 ABSENCE_OVERLAP; DB count 1 | Pass |
| H1 different employees | 2 create same dates different employees | both OK | Pass |
| H2 concurrent review | 2 attendanceService.review | 1 OK / 1 ATTENDANCE_ALREADY_REVIEWED; reviews=1 | Pass |

---

## 9. Atomicity tests

| Test | Failure injected | DB expected | DB actual |
|------|------------------|-------------|-----------|
| H3 approve missing attachment | assert throws in transition | no commit / status unchanged | Unit: begin+rollback path via stubbed assert; SQL concurrency delete-vs-approve **not run** |
| H4 session complete before commit | n/a (structural) | session update same tx as checkout | Source order verified |
| H4 forced session failure | not injected in this phase | full rollback | **Pending follow-up** |

---

## 10. Validation commands

| Command | Result |
|---------|--------|
| `cd backend && npm run build` | exit 0 |
| `npx tsx --test src/utils/sql-app-lock.test.ts src/services/database-integrity-phase0a-h3.h4.unit.test.ts` | 5 pass |
| `npm run migrate` | exit 0; applied 086 |
| `npm run migrate:status` | 086 applied |
| `RUN_DB_INTEGRATION_TESTS=true … database-integrity-phase0a.integration.test.ts` | 3 pass / 0 fail (cleanup FK warnings ignored; force-exit) |
| `npx eslint` on touched sources | exit 0 |

---

## 11. Issues pendientes

1. H3 SQL race: approve vs attachment soft-delete under load (optional follow-up integration).
2. H4 injected failure inside tx to prove rollback of both writes.
3. Attendance review audit still post-commit (original P2 / H10).
4. Deadlock retry framework for 1205 — not introduced; document as follow-up if production deadlocks appear from applock + UPDLOCK combinations.

### Lock inventory (new)

| Resource | Scope | Order | Duration |
|----------|-------|-------|----------|
| `absence:{company}:{employee}` | Exclusive, Transaction | First in create/edit tx | Until commit/rollback |
| `absence_request_attachments` AVAILABLE rows | UPDLOCK HOLDLOCK | After request row lock in approve | Until commit/rollback |
