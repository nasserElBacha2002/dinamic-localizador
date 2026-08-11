# Payroll multiple receipts — audit

**Date:** 2026-08-07  
**Status:** `IMPLEMENTED` (see implementation + validation docs)  
**Scope:** Support `employee + period → 0..N` ASSOCIATED payroll receipt files (was: `0..1`).

---

## Current architecture

### Domain model

- **Batch** (`payroll_receipt_batches`): upload run scoped to company + year + month. Many batches per period allowed.
- **Receipt** (`payroll_receipts`): one PDF row with own UUID `id`, status lifecycle (`PENDING` → `ASSOCIATED` | `DUPLICATE` | `REPLACED` | `DELETED` | association failures), optional `employee_id`, `checksum_sha256`, GCS object key.
- **Active rule (by design):** at most **one** row with `status = ASSOCIATED` and `deleted_at IS NULL` per `(company_id, employee_id, year, month)`.

### Upload flow

```text
Admin UI (UploadPayrollReceiptsDialog)
  → POST /payroll-receipt-batches { year, month }
  → POST /batches/:batchId/receipts (per PDF; CUIL from filename)
  → service: findActiveAssociated?
       yes → status DUPLICATE, no GCS upload
       no  → GCS upload → ASSOCIATED + enqueue WhatsApp notification outbox
  → optional replace: POST /payroll-receipts/:id/replace
       → new ASSOCIATED, old soft-superseded REPLACED
```

Second upload of a **different** file for the same employee + period **fails** as `DUPLICATE` unless the admin uses **replace** (which removes the previous active receipt).

### Storage

Object key pattern (already multi-safe):

```text
{prefix}/companies/{companyId}/payroll-receipts/{year}/{month}/{receiptId}/original
```

Keys include `receiptId` → **no GCS overwrite** for same period. Storage is not the blocker.

### Read / WhatsApp

- Admin list: paginated receipts by id (could show N rows if API allowed multiple ASSOCIATED).
- WhatsApp query (`payroll-receipt.handler.ts`): parse `MM/YY` → `findActiveAssociated` (`SELECT TOP 1`) → send **one** PDF via `deliverReceipt`.
- Notification worker: one outbox row per `(company_id, payroll_receipt_id, notification_type)`; fires when a receipt becomes ASSOCIATED.

### Duplicates / hash

- Column `checksum_sha256` is stored on upload.
- Dedup of “same bytes twice” is **not** enforced as a product rule for allowing multi-file periods; period uniqueness is enforced via ASSOCIATED unique index + pre-check.
- Batch idempotency: unique `(company_id, batch_id, idempotency_key)` when key present.

### Delete

By **receipt id** only (`DELETE /payroll-receipts/:id`). Soft-delete; does not delete by employee+period. Safe for multi-receipt once uniqueness is removed.

---

## Single-receipt assumptions

| Layer | Location | Assumption |
|-------|----------|------------|
| **DB** | `database/migrations/081_payroll_receipts.sql` `UX_payroll_receipts_active_period` | Unique filtered index: one ASSOCIATED per company+employee+year+month |
| **Backend** | `payroll-receipt.repository.ts` `findActiveAssociated` | `SELECT TOP 1` for period lookup |
| **Backend** | `payroll-receipt.service.ts` upload path | Pre-check → mark `DUPLICATE` / message “Ya existe un recibo…” |
| **Backend** | `payroll-receipt.service.ts` replace | Supersedes previous ASSOCIATED |
| **API** | Upload + replace contracts | Second file = conflict or replace, not add |
| **Storage** | N/A for uniqueness | Keys already per `receiptId` |
| **Frontend** | `UploadPayrollReceiptsDialog` + labels | Treats `DUPLICATE` as conflict; replace on detail |
| **WhatsApp** | `whatsapp-router/payroll-receipt.handler.ts` | One receipt → one delivery |
| **Jobs** | Notification outbox | 1:1 with receipt id (OK for N receipts if N notifications acceptable) |
| **Tests** | `payroll-receipt.service.test.ts` | Asserts DUPLICATE without upload when active exists |

---

## Root cause

**Product/schema design, not an accidental bug.** Concurrent multiple active files for the same period are blocked by:

1. Filtered unique index `UX_payroll_receipts_active_period`
2. Application pre-check + race handling → `DUPLICATE`
3. WhatsApp/consumers using `findActiveAssociated` (singular)

Storage path is already compatible with N files.

---

## Migration risk

| Risk | Severity | Notes |
|------|----------|--------|
| Drop unique index | Medium | Additive migration only; existing 1:1 data remains valid as 1:N with N=1 |
| Upload semantics change | High UX | `DUPLICATE` for “second file same period” must become success (add) |
| Replace semantics | Medium | Keep replace-by-id; clarify vs “add another” |
| WhatsApp send-all | High | Need `findMany` + ordered sequential send; partial failure / retry design |
| Notifications | Medium | 3 uploads → 3 “available” templates unless dedupe by period is added |
| Historical REPLACED rows | Low | Remain history; do not revive as second active unless product wants |

**Data loss risk if done carefully:** low (drop unique + stop marking period collisions as DUPLICATE; no rewrite of existing blobs).

---

## Proposed implementation (minimal safe)

1. **Migration** `085_…`: `DROP INDEX UX_payroll_receipts_active_period`; keep/confirm non-unique `(company_id, employee_id, year, month)` / period indexes for query.
2. **Repository:** add `listActiveAssociated(companyId, employeeId, year, month)` ordered by `created_at ASC`; keep `findById` for detail/delete/replace.
3. **Service upload:** remove “active exists → DUPLICATE” for same period; still use idempotency key; optionally warn (not block) on identical `checksum_sha256` within period — **no aggressive dedup** unless product asks.
4. **Keep** replace-by-id and delete-by-id unchanged.
5. **WhatsApp:** list receipts for period; 0 → not found; 1 → send one; N → intro text then sequential `deliverReceipt` per id; track delivery per receipt (extend outbox or session progress) to avoid re-sending successes on retry.
6. **Frontend:** stop treating period collision as hard conflict; list already row-per-receipt — optionally group/filter by period; upload CTA = “añadir”.
7. **Notifications:** document choice — default preserve **notify per ASSOCIATED upload** (matches current outbox model).
8. **Tests:** persistence 2nd upload OK; list returns N; isolation; delete one leaves others; WhatsApp 0/1/N; partial send retry.

### Open decisions (non-blocking for start; resolve during implement)

1. Notification dedupe per period vs one message per file upload.
2. Whether identical checksum within period should soft-warn only or still allow.
3. WhatsApp partial-failure persistence: session progress vs new outbox rows keyed by receipt id + query sid.

---

## Acceptance mapping (pre-implement)

| # | Criterion | Today | After |
|---|-----------|-------|-------|
| 1 | N receipts same period | Blocked | Required |
| 2 | 2nd upload does not replace | DUPLICATE / replace only | Add |
| 3 | Independent identity | Already (`id`) | Keep |
| 4 | Storage no overwrite | Already | Keep |
| 5–8 | List / FE / delete one / WA all | Singular assumptions | Update |
| 9 | Tenant isolation | company_id scoped | Preserve |
| 10 | Existing data | Valid | Preserve |
| 11–12 | Tests / no bad TOP 1 in collection paths | Missing multi | Add |

---

## Suggested next step

`/implement-dinamic-stage` — implement per this audit (migration → repo/service → WhatsApp → FE → tests → validation docs).
