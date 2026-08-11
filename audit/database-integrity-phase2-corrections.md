# Database Integrity Phase 2 — Corrections

## Executive Summary

Estado: **COMPLETE**

Closed review gaps with real SQL Server evidence for invitation accept/decline atomicity, hardened the audit sanitizer (exact normalized families, no `tokenCount` false positive), and ensured the global audit test hook resets via `try/finally`.

---

## Findings corrected

| # | Finding | Action |
|---|---------|--------|
| 1 | Invitation accept rollback untested | Added success + audit-fail tests (new user) |
| 2 | Already-member accept branch untested | Added success + audit-fail tests |
| 3 | Decline rollback untested | Added success + audit-fail tests |
| 4 | “Covered by pattern” in report | Replaced with concrete pass evidence |
| 5 | Sanitizer exact regex / false positives | Normalized exact family set + safe-field tests |
| 6 | Hook not reset on assert failure | All hook uses wrapped in `try/finally` |
| 7 | Hook couldn’t target CRITICAL action only | Hook now receives insert input (filter by `action`) |

---

## Invitation atomicity evidence

| Case | Result |
|------|--------|
| accept normal → ACCEPTED + membership ACTIVE + `invitation_accepted` | pass |
| accept normal audit failure → PENDING, no user, no membership, audit=0 | pass |
| already-member accept success → ACCEPTED + audit | pass |
| already-member audit failure → PENDING, membership unchanged, audit=0 | pass |
| decline success → DECLINED + `invitation_declined` | pass |
| decline audit failure → PENDING, audit=0 | pass |

Note: `invitation_accept_started` remains BEST_EFFORT (outside TX). Failure injection filters on `invitation_accepted` / `invitation_declined` only.

---

## Attendance evidence

| Case | Result |
|------|--------|
| success → business + history + audit | pass |
| audit failure → all rollback | pass |
| concurrent → exactly one success audit | pass |

---

## Membership evidence

| Case | Result |
|------|--------|
| role success → mutation + audit (actor/target) | pass |
| audit failure → mutation rollback | pass |
| last OWNER reject → no success audit | pass |

---

## Sanitization policy

- **Primary rule:** CRITICAL callers send minimal allowlisted diffs.
- **Secondary defense:** `sanitizeAuditPayload` exact-matches normalized keys (`lowercase`, strip `_`/`-`) against a small family set.
- Does **not** redact `tokenCount`, `status`, `role`.
- Covers variants such as `clientSecret`, `providerApiKey`, `twilioAuthToken`, `signedUrl`, nested objects/arrays.

---

## Audit-flow classification matrix

| Flow | Mutation | Actor | History/SoT | Audit | Classification | Reason |
|------|----------|-------|-------------|-------|----------------|--------|
| Attendance review | update record + insert review | reviewer user | `attendance_reviews` | `audit_logs` in-TX | CRITICAL_AUDIT | Admin decision must not lose trail |
| Membership role/status | update membership | admin actor | memberships | `audit_logs` in-TX | CRITICAL_AUDIT | Privilege change |
| Invitation accept (new/existing) | accept + membership | invitee | invitation + membership | `audit_logs` in-TX | CRITICAL_AUDIT | Access grant |
| Invitation accept already ACTIVE | mark accepted | invitee | invitation | `audit_logs` in-TX | CRITICAL_AUDIT | Distinct branch |
| Invitation decline | mark declined | invitee | invitation | `audit_logs` in-TX | CRITICAL_AUDIT | Access denial decision |
| Invitation accept_started / denials | none / reject | various | n/a | `logAuditSafe` | BEST_EFFORT_BY_DESIGN | No successful mutation to couple |
| Company lifecycle | status transitions | admin/job | `company_lifecycle_events` | optional best-effort index | ALREADY_SAFE | Domain event in-TX |
| Absence approve/reject/cancel | request + ledger/sync | admin | request + ledger | `audit_logs` in-TX | ALREADY_SAFE | Already transactional |
| Payroll upload/delete | receipt rows + GCS | admin | receipt rows | post-write | BEST_EFFORT_BY_DESIGN | No distributed TX |
| Work teams admin | team/members | admin | tables | mostly post-write | FOLLOW_UP_P2 | Not Phase 2 P1 |
| Operation admin | operations/assignments | admin | tables | mixed | FOLLOW_UP_P2 | Not Phase 2 P1 |
| Imports | bulk writes | admin | import jobs | best-effort | FOLLOW_UP_P3 | High volume / batch |
| Permissions | seed/static | n/a | seed | none | NO_AUDIT_REQUIRED | Not mutable via product API |

---

## Tests

Suite: `database-integrity-phase2.integration.test.ts` + `audit-sanitize.test.ts`

```text
integration: 12 pass / 0 fail
sanitize unit: 3 pass / 0 fail
```

---

## Validation

See `audit/implementation-corrections-validation.txt`.

---

## Remaining issues

- Work teams / operations / imports admin audits remain FOLLOW_UP (not this correction).
- Company cascade cleanup warnings in tests are unrelated to audit atomicity.
- Do not start Phase 3 until this package is accepted.
