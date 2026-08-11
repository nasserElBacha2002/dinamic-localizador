# Payroll multiple receipts — implementation

**Status:** `IMPLEMENTED_WITH_ISSUES`  
**Date:** 2026-08-07  
**Based on:** `audit/payroll-multiple-receipts-audit.md`  
**Corrections evidence:** `audit/payroll-multiple-receipts-corrections-validation.md`

## Migration

File: `database/migrations/086_payroll_multiple_receipts_per_period.sql` (applied on local SQL Server)

- **Dropped:** `UX_payroll_receipts_active_period`
- **Added (non-unique):** `IX_pr_active_employee_period`
- **Added (unique filtered):** `UX_payroll_receipts_active_checksum` on  
  `(company_id, employee_id, year, month, checksum_sha256)` where ASSOCIATED + not deleted + checksum NOT NULL
- **Added table:** `whatsapp_payroll_receipt_query_deliveries` with status `PENDING | ACCEPTED | FAILED`
- **Unique query identity:** `UQ_wprqd_session_period_receipt` on  
  `(company_id, bot_session_id, employee_id, year, month, payroll_receipt_id)`

Rollback: not automatically safe once multiple ASSOCIATED exist per period.

## Upload / concurrency

- Distinct files same employee+period → multiple ASSOCIATED
- Same checksum → DUPLICATE (app) / unique index (DB)
- Concurrent distinct → both ASSOCIATED (SQL evidence)
- Concurrent same checksum → exactly one ASSOCIATED (SQL evidence)

## Repository

- `listActiveAssociated` — ordered `created_at ASC, id ASC`
- `findActiveAssociatedByChecksum` — dedupe
- **`findActiveAssociated` removed** (no singular ambiguous API)

## Replace / delete

- By `receiptId` only; siblings untouched
- Replace txn marks old REPLACED before associating new (checksum unique)

## WhatsApp period query

- Identity: company + bot_session + employee + year + month
- `completed` **iff** `deliveredCount === totalCount`
- Else: `partial_temporary` | `partial_failed` | `failed`
- Retry skips `ACCEPTED` only; new bot session = new consultation = can resend all
- Session completes only on `completed` / `not_found`

## Twilio semantics

`ACCEPTED` = Twilio accepted outbound create. Not delivery-callback confirmed. No duplicate status-callback subsystem on this table.

## Notifications

Unchanged: 1 ASSOCIATED → 1 `PAYROLL_RECEIPT_AVAILABLE`.

## Known issues (status driver)

- Repo-wide `backend npm run lint` still fails on pre-existing unrelated errors; feature-touched files are eslint-clean.
