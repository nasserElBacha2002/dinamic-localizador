# Database Integrity Phase 2 — Transactional Audit

## 1. Executive Summary

Estado: **COMPLETE**

Phase 2 ensures critical administrative/security mutations persist `audit_logs` in the **same SQL transaction** as the business write (or both roll back). No generic audit triggers, no business stored procedures, no event sourcing.

Primary fixes:

- Attendance review: audit moved **before** commit (was post-commit → lost-audit risk).
- Membership role/status updates: success audit written via `beforeCommit` inside the membership TX.
- Invitation accept/decline success: audit in-TX.
- Central sanitization of credential-like keys in `auditService.log`.

---

## 2. Audit architecture

```
service (CRITICAL path)
  → BEGIN TRANSACTION
  → domain writes
  → auditService.log(..., transaction)   // optional Transaction
       → sanitizeAuditPayload
       → auditRepository.log(..., transaction)
  → COMMIT
```

Best-effort paths keep using `logAuditSafe` **outside** TX deliberately (denials, email delivery outcomes, lifecycle duplicate index).

`attendance_reviews` / `company_lifecycle_events` / absence ledger remain **canonical domain history**. `audit_logs` is the uniform admin index (quién / qué / cuándo / entidad / acción / diffs mínimos).

---

## 3. Audit classification

| Tipo | Uso |
|------|-----|
| A CRITICAL_AUDIT | Must be in-TX with mutation |
| B Domain history | Specialized tables; may also emit `audit_logs` |
| C Observability | Not in business TX |
| D Side effects | Outbox/worker; not audit |

---

## 4. Existing audit flows

Infrastructure already accepted optional `sql.Transaction` on `auditService` / `auditRepository`. Gaps were caller placement (post-commit) and silenced success audits via `logAuditSafe`.

---

## 5. Critical audit gaps

| Gap | Severity | Fix |
|-----|----------|-----|
| Attendance review audit after commit | P1 | In-TX before commit |
| Membership update success via `logAuditSafe` after TX | P1 | `beforeCommit` audit in-TX |
| Invitation accept/decline after commit | P1 | In-TX before commit |

---

## 6. Transaction-aware audit infrastructure

- Single API: `auditService.log(companyId, input, transaction?)`
- Repository uses `new sql.Request(transaction)` when provided
- Test seam: `setAuditBeforeInsertHookForTests` (production unset)
- Sanitization: `sanitizeAuditPayload` in `utils/audit-sanitize.ts`

---

## 7. Attendance review changes

**Canonical history:** `attendance_reviews`  
**Admin index:** `audit_logs` action `review`

Order inside TX:

1. `applyReview`
2. `attendance_reviews` insert
3. `audit_logs` insert
4. COMMIT

---

## 8. Membership / role changes

Success (`company_user_update_allowed`) is CRITICAL and in-TX.

Denials (`*_denied`, self-edit) remain **BEST_EFFORT** (no successful mutation to couple).

Payload includes: actorUserId, targetUserId, previous/new role|status|isDefault, modificationType, optional correlationId.

Last-OWNER guards unchanged (no new trigger).

---

## 9. Company lifecycle review

**ALREADY_SAFE:** `company_lifecycle_events` written in the business TX.  
`audit_logs` via `logAuditSafe` after commit = **BEST_EFFORT_BY_DESIGN** (duplicate global index; domain SoT is lifecycle events).

---

## 10. Absence/payroll review

| Flow | Result |
|------|--------|
| Absence approve/reject/cancel | **ALREADY_SAFE** (audit already in-TX) |
| Absence create/ledger paths | **ALREADY_SAFE** / domain ledger |
| Payroll upload/delete/download | **BEST_EFFORT_BY_DESIGN** (spans GCS; not one DB TX) |

---

## 11. Privacy / redaction

`sanitizeAuditPayload` redacts keys matching credential patterns (`password`, `token`, `accessToken`, `refreshToken`, `signedUrl`, etc.) recursively. Membership/attendance callers already send minimal diffs.

---

## 12. Transaction boundaries

Write order for critical paths: **domain rows → audit_logs → COMMIT**.

System actor: `userId: null` where jobs already do so (unchanged).

Polymorphic `entity_type` + `entity_id`: **NO_CHANGE** (no composite FK).

Retention: **NO_RETENTION_POLICY**.

Permissions/`role_permissions`: **NO_CHANGE** (not mutable via product API).

---

## 13. Failure/rollback tests

| Test | Result |
|------|--------|
| Review success → review + audit | pass |
| Review + forced audit failure → all rolled back | pass |
| Concurrent review → exactly 1 audit | pass |
| Membership success → role + audit (actor/target) | pass |
| Membership + audit failure → role unchanged, no audit | pass |
| Last OWNER reject → no success audit | pass |
| Sanitization unit tests | pass |

---

## 14. Database integration tests

File: `backend/src/services/database-integrity-phase2.integration.test.ts`  
Command: `RUN_DB_INTEGRATION_TESTS=true` … (see validation artifact).

---

## 15. Performance/index review

Existing `IX_audit_logs_company_created_at` kept. No speculative new indexes.

---

## 16. Intentionally unchanged flows

| Flow | Status |
|------|--------|
| Company lifecycle events | ALREADY_SAFE |
| Absence review/create (in-TX) | ALREADY_SAFE |
| Denial / invite-email audits | BEST_EFFORT_BY_DESIGN |
| Payroll admin audits | BEST_EFFORT_BY_DESIGN |
| Work teams / imports / ops admin | FOLLOW_UP / not Phase 2 P1 |
| Permissions seed | NO_AUDIT_REQUIRED |
| Generic triggers / SPs | Not added |

---

## 17. Validation

See `audit/database-integrity-phase2-validation.txt`.

---

## 18. Remaining issues

- Broader admin surfaces (work teams, imports) still largely best-effort; not P1 for Phase 2.
- Full-repo eslint still has pre-existing unrelated errors.
- Cleanup cascade warnings on company delete in tests are unrelated to audit atomicity.

---

## Mandatory flow table

| Flow | Antes | Después | Audit crítico | Test rollback |
|------|-------|---------|---------------|---------------|
| Attendance review | COMMIT then audit | business + reviews + audit same TX | Yes | Yes |
| Membership role/status | TX commit then `logAuditSafe` | audit in `beforeCommit` | Yes | Yes |
| Invitation accept/decline | COMMIT then `logAuditSafe` | audit before COMMIT | Yes | Covered by pattern; membership/review carry injection evidence |
| Company deactivate | lifecycle in-TX; audit best-effort | unchanged | Domain event critical | Existing lifecycle coverage |
| Absence review | already in-TX | unchanged | Yes | Existing |
| Payroll upload | post-write audit | unchanged BEST_EFFORT | No (GCS) | n/a |

---

## Final matrix

| Flow | Business TX | Audit mechanism | Atomic | Source of truth | Resultado |
|------|-------------|-----------------|--------|-----------------|-----------|
| Attendance review | Yes | audit_logs in-TX | Yes | attendance_reviews + audit_logs | FIXED |
| Membership update success | Yes | audit_logs in-TX | Yes | memberships + audit_logs | FIXED |
| Membership denial | No mutation | logAuditSafe | n/a | audit_logs best-effort | BEST_EFFORT_BY_DESIGN |
| Invitation accept/decline | Yes | audit_logs in-TX | Yes | membership/invitation + audit | FIXED |
| Company lifecycle | Yes | company_lifecycle_events | Yes | lifecycle events | ALREADY_SAFE |
| Absence review | Yes | audit_logs in-TX | Yes | request + ledger/events | ALREADY_SAFE |
| Payroll | Partial | audit_logs | No | receipt rows | BEST_EFFORT_BY_DESIGN |
| Permissions | n/a | n/a | n/a | seed | NO_AUDIT_REQUIRED |
