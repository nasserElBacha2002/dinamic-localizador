# Payroll multiple receipts — corrections validation

**Final status:** `IMPLEMENTED_WITH_ISSUES`  
**Date:** 2026-08-07  
**Scope:** Senior review corrections on Payroll multiple receipts (P1 result semantics, period-scoped query identity, ACCEPTED vs SENT, ensure concurrency, SQL evidence, docs).

## Architectural decisions

1. **Result invariant:** `kind === "completed"` iff `deliveredCount === totalCount`. Otherwise `partial_temporary` | `partial_failed` | `failed`. Handler completes the bot session only on `completed` / `not_found`.
2. **Query identity (opción A):** no new query table. Deliveries keyed by `(company_id, bot_session_id, employee_id, year, month, payroll_receipt_id)`. July never contaminates August in the same session.
3. **Twilio semantics:** delivery status `PENDING | ACCEPTED | FAILED`. `ACCEPTED` = Twilio accepted `messages.create` (retry skip). Not a provider delivery callback; no second tracking system.
4. **ensurePendingDeliveries:** optimistic INSERT gated by receipt integrity (`EXISTS` matching company/employee/period ASSOCIATED) + catch only expected unique violation `UQ_wprqd_session_period_receipt`.
5. **Migration 086:** amended in place before first shared apply (status ACCEPTED, period unique, year CHECK 1900–2200). Applied successfully on local SQL Server.

## Commands executed (real)

| Command | Exit | Summary |
|---------|------|---------|
| `cd backend && npm run migrate` | 0 | Applied `085_…`, `086_payroll_multiple_receipts_per_period.sql` |
| `cd backend && npm run migrate:status` | 0 | `086_…` listed **applied** |
| Schema probe via sqlcmd | 0 | `UX_payroll_receipts_active_checksum`, `IX_pr_active_employee_period`, table `whatsapp_payroll_receipt_query_deliveries`, `UQ_wprqd_session_period_receipt`, CK status PENDING/ACCEPTED/FAILED; period unique **absent** |
| `npx tsx --test …payroll-receipt-period-query.service.test.ts …payroll-receipt.service.test.ts …file-validation.test.ts` | 0 | 22 pass |
| `EMAIL_TRANSPORT=console RUN_DB_INTEGRATION_TESTS=true npx tsx … payroll-multiple-receipts.integration.test.ts` | 0 | 6/6 SQL concurrency/isolation pass |
| `cd backend && npm run build` | 0 | `tsc` OK |
| `cd backend && npm test` | 0 | 1211 pass / 0 fail |
| `cd backend && npm run lint` | **1** | 64 errors repo-wide (pre-existing outside this feature). **Feature files eslint clean** (`payroll-receipt*.ts`, query-delivery repo, handler). |
| `cd frontend && npx eslint` (payroll pages/labels) | 0 | clean |
| `cd frontend && … payroll-receipt-labels.test.ts` | 0 | pass |
| `cd frontend && npm run build` | 0 | Vite build OK |
| `cd frontend && npm run lint` / full `npm test` | not re-run in full suite this pass | Targeted payroll FE checks + build used as evidence |

## SQL concurrency evidence

- Distinct checksums concurrent INSERT → both ASSOCIATED.
- Same checksum concurrent INSERT → exactly 1 ASSOCIATED + unique violation (2627/2601).
- `ensurePendingDeliveries` concurrent ×2 → exactly 1 delivery row.
- `listForQuery` period isolation within same bot session.

## Residual risks / issues

1. **Backend repo-wide `npm run lint` fails** with many pre-existing errors unrelated to this feature (e.g. whatsapp-webhook integration unused vars, operational-domain, absence file-validation control-regex). Feature-touched files are clean.
2. Rollback of `086` restoring `UX_payroll_receipts_active_period` is **not safe** once multiple ASSOCIATED rows exist for one period (documented in rollback SQL).
3. `ACCEPTED` is not Twilio delivery-confirmed; a later status callback `failed` would not currently flip this delivery entity (by design — reuse existing outbound tracking elsewhere; no duplicate system).
4. Concurrent identical checksum at the **service** layer still relies on unique index + GCS compensate delete (same pattern as prior races).

## Acceptance mapping

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | completed ⇒ deliveredCount === totalCount | period-query service + tests |
| 2 | permanent partial ≠ success | `partial_failed` test A OK / B FAIL / C OK |
| 3 | 07/26 deliveries ≠ 08/26 | unit + SQL integration |
| 4 | retry skips ACCEPTED | unit retry test |
| 5 | new session can resend all | unit new-session test |
| 6 | ensure concurrent idempotent | SQL integration |
| 7–8 | multi ASSOCIATED + checksum unique | migration + SQL tests |
| 9–10 | replace/delete target only | service unit tests |
| 11 | tenant isolation | company_id on all queries |
| 12 | ACCEPTED semantics explicit | migration + repo docs |
| 13–14 | migrate + SQL concurrency | migrate exit 0 + integration 6/6 |
| 15 | build/tests | backend build+test pass; FE build pass; full backend lint fail (pre-existing) |
| 16 | docs reflect reality | this file + updated implementation/validation |
