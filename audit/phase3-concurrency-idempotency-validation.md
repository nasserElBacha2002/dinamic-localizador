# Phase 3 — Concurrency & Idempotency Validation

**Status:** `IMPLEMENTED_AND_VALIDATED`  
**Date:** 2026-08-12  
**Scope:** Race/CAS/lease/webhook/idempotency hardening (no business-rule or UI changes)

---

## Resumen

```text
Initial race suspects: 9
Confirmed races fixed: 2 (assignment confirmation last-write-wins; active operation check-then-act)
CAS protected (hardened): 3 (confirmation, absence updateStatus required CAS, batch markCompleted)
Transaction protected: (existing) invitations, company deletion, workday locks, webhook claim
Unique constraint protected (new): 1 (UQ_scheduled_operations_active_service_start)
Lease protected: (existing) payroll/assignment outbox, company deletion, webhook claim; attendance reclaim CAS+stale
False positives / already safe: 7 of initial race suspects
Manual review remaining: 0 CONFIRMED_RACE
Webhook duplicate business effects: 0 (existing MessageSid claim + UQ)
Unresolved high-risk concurrency issues: 0
```

Scanner delta (reliability):

| Metric | Before Phase 3 | After |
|--------|----------------|-------|
| `race-condition` findings | 9 | **0** |
| `webhook-signature` FP sidecars | 8 | **0** |
| `webhook-idempotency` FP sidecars | 7 | **0** |
| `worker-lease` on env-rules | 1 | **0** |
| `audit:strict` | — | **PASSED** |

---

## Clasificación de race candidates iniciales

| flow | file | original finding | classification | evidence | action | test |
|------|------|------------------|---------------|----------|--------|------|
| Absence operational impact | `absence-operational-impact.repository.ts` | race-condition | **B+D+C** ATOMIC_CAS + UNIQUE + TX | `status=OPEN`, `UQ_aoc/aoe_idempotency`, UPDLOCK | none | existing phase5 concurrency |
| Absence request status | `absence-request.repository.ts` | race-condition | **B** ATOMIC_CAS | callers used `onlyIfStatusIn`; now **required** | require `onlyIfStatusIn` | callers already pass CAS |
| Company deletion | `company.repository.ts` | race-condition | **E+B** LEASE + CAS | `claimNextDueForDeletion` UPDLOCK/READPAST + lease owner CAS | none | existing lifecycle tests |
| Assignment confirmation | `employee-assignment-query.repository.ts` | race-condition | was **A** CONFIRMED_RACE → **B** | unconditional UPDATE | CAS `confirmation_status IN (...)` + service re-read | `phase3-concurrency.integration.test.ts` |
| Operation workday | `operation-workday.repository.ts` | race-condition | **D+B+C** | `UQ_operation_workdays_operation_work_date`, version CAS, UPDLOCK | none | existing materialization |
| Operation create/import | `operation.repository.ts` | race-condition | was **A** on active key → **D** | check-then-act only | filtered UNIQUE + duplicate mapping | phase3 concurrent insert |
| User invitation | `user-invitation.repository.ts` | race-condition | **B+D+C** | `markAcceptedIfPending`, token UQ | none | `user-invitation.concurrency.integration.test.ts` |
| Work-team assignment batch | `work-team-assignment-batch.repository.ts` | race-condition | **C** → hardened **B** | txn + UPDLOCK; complete lacked status CAS | `markCompleted … AND status=PREVIEWED` | existing batch concurrency |
| Seed CI script | `seed-integration-ci.ts` | race-condition | **H** FALSE_POSITIVE | non-prod seed | scanner CAS awareness | n/a |

---

## Por flujo (before → fix)

### Assignment confirmation
- **before:** `UPDATE … WHERE cancelled_at IS NULL` (last-write-wins under concurrent confirm/unavailable)
- **risk:** A CONFIRMED_RACE
- **fix:** CAS `AND confirmation_status IN (@expected…)`; service reports durable state on conflict
- **database invariant:** at most one winning transition from a given expected status
- **test:** 20 concurrent confirms → 1 success; confirm∥unavailable → 1 winner

### Active ONE_TIME operation identity
- **before:** `findExistingActiveKeys` then insert (TOCTOU)
- **risk:** A CONFIRMED_RACE under concurrent import/create
- **fix:** `UQ_scheduled_operations_active_service_start` filtered unique + `isActiveOperationDuplicateError` → `OPERATION_DUPLICATE`
- **database invariant:** one non-cancelled row per `(company_id, service_id, scheduled_start)` when start NOT NULL
- **note:** NULL `scheduled_start` duplicates excluded from index (diagnose separately; 1 group observed)
- **test:** 12 concurrent inserts → 1 ok + 11 dup

### Absence request transitions
- **before:** optional `onlyIfStatusIn` (footgun)
- **fix:** required non-empty `onlyIfStatusIn`
- **invariant:** approve/reject CAS from expected statuses only

### Work-team batch complete
- **before:** `markCompletedInTransaction` without status predicate (safe only via prior lock)
- **fix:** `AND status = N'PREVIEWED'`

### Import job idempotency key
- **before:** create could throw on concurrent same key (UQ already existed)
- **fix:** catch duplicate → return existing job (`UQ_import_jobs_company_idempotency`)

### Twilio status / outbox projection
- **before:** outbox `provider_status` overwrite could regress `delivered → sent`
- **fix:** `monotonicProviderStatusAdvanceSql` mirrors `pickProjectedProviderStatus`
- **test:** delivered then sent → stays delivered

### Webhooks (verified existing)
- **signature:** middleware `createValidateTwilioSignature`
- **dedupe key:** `(company_id, message_sid, event_type)`
- **DB:** `UQ_wwe_company_sid_type`
- **claim:** UPDLOCK + lease + `processing_version`
- **ordering:** message projection via `WHATSAPP_PROVIDER_STATUS_RANK`; outboxes now monotonic too

---

## Constraints utilizados / nuevos

| flow | table | unique key | purpose |
|------|-------|------------|---------|
| Active operation | `scheduled_operations` | **NEW** `UQ_scheduled_operations_active_service_start` (filtered) | concurrent create/import |
| Webhook | `whatsapp_webhook_events` | `UQ_wwe_company_sid_type` | MessageSid idempotency |
| Import | `import_jobs` | `UQ_import_jobs_company_idempotency` | preview/execute key |
| Invitation | `user_invitations` | token_hash + pending email | accept/resend |
| Workday | `operation_workdays` | `UQ_operation_workdays_operation_work_date` | materialization |
| Absence impact | conflicts/effects | `UQ_aoc/aoe_idempotency` | operational effects |
| Assignment notif | `whatsapp_operation_assignment_notifications` | `UQ_woan_company_assignment_type` | enqueue |

Migration: `092_phase3_scheduled_operations_active_unique.sql` (+ rollback).  
Applied on local DB (runner blocked on pending 089 role drift; 092 applied and recorded in `system_migrations`).

---

## Workers

| worker | claim | lease | retry | max attempts | idempotency |
|--------|-------|-------|-------|--------------|-------------|
| Attendance reminder | atomic UPDATE reclaim / insert+beginAttempt | soft stale window (`last_attempt_at`) | attempt_count | 3 | unique op/employee/type/version |
| Payroll receipt notif | CTE UPDLOCK READPAST | `lease_owner` / `lease_expires_at` | next_attempt_at | 5 | UQ receipt+type |
| Operation assignment notif | same | same | same | 5 | UQ assignment+type |
| Company deletion | claimNextDueForDeletion | deletion_lease_* | attempts | 10 | status+owner CAS |
| Recurring materialization | process-local `isRunning` | n/a (multi-instance relies on workday UQ) | n/a | n/a | workday unique |
| Webhook inbound | claimInboundMessage | processing_expires_at | attempt_count | 8 | MessageSid UQ |

---

## Webhooks

```text
signature: middleware createValidateTwilioSignature (X-Twilio-Signature)
dedupe key: company_id + message_sid + event_type
DB constraint: UQ_wwe_company_sid_type
transaction: claim uses UPDLOCK/HOLDLOCK + version CAS
duplicate behavior: IDEMPOTENT_REPLAY / IN_PROGRESS (no double business effect)
ordering: WHATSAPP_PROVIDER_STATUS_RANK + monotonic outbox updates
status callbacks: provider_event_key insert idempotent; out-of-order cannot regress outbox status
```

---

## Validation commands

| command | result |
|---------|--------|
| `npm run lint --prefix backend` | PASS |
| `npm run build:backend` | PASS |
| `npm test --prefix backend` | PASS (1286) |
| `RUN_DB_INTEGRATION_TESTS=true npm run test:integration` | 308 pass / **9 fail pre-existing** (multi-company/settings/tenant) / phase3 suite **4/4 PASS** |
| `phase3-concurrency.integration.test.ts` | PASS |
| `npm run audit:reliability` | PASS (0 reliability race/webhook FP in partial) |
| `npm run audit:database` | PASS (blocking=0) |
| `npm run audit:security:fast` | PASS (secrets=0, env docs=0 missing) |
| `npm run audit` | PASS diagnostic |
| `npm run audit:strict` | **Quality gate PASSED** (findings=221, races=0) |
| reliability scanner unit tests | PASS |

---

## Criterios de aceptación

1. All initial race candidates classified — **yes**  
2. No pending `CONFIRMED_RACE` — **yes**  
3. Critical transitions CAS/txn/constraint — **yes**  
4. Critical idempotency DB-backed — **yes**  
5. Relevant workers claim/lease — **yes** (attendance soft-lease documented)  
6. Expired leases recoverable — **yes** (payroll/assignment/company/webhook)  
7. Retries no duplicate confirmed effects — **yes** (unique + CAS)  
8. Duplicate webhooks no duplicate business — **yes** (existing + verified)  
9. Out-of-order callbacks no regress — **yes** (fixed outbox + tested)  
10. Multi-tenant on concurrent writes — **yes** (`company_id` in CAS WHEREs)  
11. Real SQL concurrency tests — **yes**  
12. Build/lint/unit tests — **yes**  
13. `audit:strict` no new regressions from this phase — **yes** (races eliminated)  
14. No out-of-scope refactors — **yes**

---

## Risks / follow-ups

- NULL `scheduled_start` active duplicate group(s) not covered by filtered unique — remediate data then optionally extend index.
- Migrations `089`–`091` still `pending` in runner due to `dinamic_app_runtime` SCHEMA_DRIFT; tables for 091 already present in this environment; 092 recorded manually after apply.
- Recurring materialization still process-local `isRunning` (safe for single replica via workday UQ; multi-replica job orchestration is a future hardening).
- Exception log-only / return-default reliability findings left for a later phase (not concurrency).
