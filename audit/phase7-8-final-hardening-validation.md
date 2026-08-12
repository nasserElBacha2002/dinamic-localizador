# Phase 7–8 — Final Hardening Validation

**Status:** `IMPLEMENTED_AND_VALIDATED`  
**Date:** 2026-08-12  
**Branch:** `DIN-272`  
**HEAD (committed tip):** `8adc48e` (Phases 6–8 code + prior cleanup)  
**Uncommitted for review:** official baseline JSON + `.gitignore` allowlist + this validation finalization  

Unified stage: **hotspot triage → selective REMOVE_NOW / caller migration → scanner FP recalibration → official baseline**.

---

## Objective

Not “0 findings”. Goal: remaining findings are **known debt / heuristic noise**, with a reproducible **regression gate**.

---

## Hotspot triage

| File | LOC | Score (god) | Classification | Decision |
| --- | --: | ---: | --- | --- |
| `absence-request.service.ts` | ~930 | 17 | **D DOMAIN_ORCHESTRATOR** (+ leftover deprecated create) | **REFACTOR** (remove dead `create` alias only); lifecycle already delegated to draft/attachment/balance/impact/sync |
| `operation.service.ts` | 764 | 17 | **D DOMAIN_ORCHESTRATOR** | **REFACTOR** (migrate to `oneTimeScheduleReconciliationCommand`; no dump Utils) |
| `operation-assignment.service.ts` | 774 | 16 | **A COHESIVE_COMPLEXITY** | **KEEP** — CAS confirmation + assignment SM; tested |
| `bot-session.service.ts` | 712 | 15 | **A COHESIVE_COMPLEXITY** | **KEEP** — single session ownership after Phase 6 |
| `payroll-receipt.service.ts` | 950 | 15 | **A COHESIVE_COMPLEXITY** | **KEEP** — 0..N receipts + storage abstraction already used |
| `attendance-reminder.service.ts` | 833 | 5 (complexity) | **D DOMAIN_ORCHESTRATOR** | **KEEP** — lease in repo; Twilio outside TX |
| `whatsapp-bot.service.ts` | 522 | 15 | **D** post–Phase 6 | **KEEP** — no further split |
| `check-in-attendance.flow.ts` | 684 | — | **A** conversational | **KEEP** |
| `checkout-attendance.flow.ts` | 788 | — | **A** conversational | **KEEP** (TX already in command) |
| `one-time-schedule-consistency.inspector.ts` | 333 | 15 | **C INFRASTRUCTURE_LEAK** justified diagnostic | **KEEP** / DEFERRED |
| `recurring-workday-materialization.service.ts` | 603 | 15 | **A** materialization | **KEEP** |
| `workday-materialization.service.ts` | 473 | 15 | **A** | **KEEP** |
| `absence-calendar.service.ts` | 707 | 14 | **A** calendar domain | **KEEP** |

### Bot session state inventory (owner = `botSessionService` + flow/command)

| State | Typical next | Owner / use case | Expiration |
| --- | --- | --- | --- |
| WAITING_LOCATION | COMPLETED / CANCELLED | check-in location | TTL |
| WAITING_OPERATION_SELECTION | WAITING_LOCATION / COMPLETED | check-in selection | TTL |
| WAITING_CHECKOUT_LOCATION | COMPLETED | checkout location | TTL |
| WAITING_CHECKOUT_OPERATION_SELECTION | WAITING_CHECKOUT_LOCATION / COMPLETED | checkout selection | TTL |
| WAITING_ABSENCE_* | next absence step / COMPLETED | absence bot | TTL |
| WAITING_CONFIRM_ATTENDANCE_SELECTION | COMPLETED | assignment confirm | TTL |
| WAITING_UNAVAILABILITY_SELECTION | COMPLETED | unavailable | TTL |
| WAITING_ATTENDANCE_CONFIRMATION_RESPONSE | COMPLETED | outbound confirm reply | TTL |
| WAITING_PAYROLL_RECEIPT_PERIOD | COMPLETED | payroll period pick | TTL |
| COMPLETED / CANCELLED | terminal | commands / service | n/a |

No FSM framework added — inventory is documentation of existing switches.

---

## Legacy / debt classification (sample of markers reviewed)

| File | Marker | Classification | Action | Expiry / follow-up |
| --- | --- | --- | --- | --- |
| `absence-request.service.ts` | deprecated `create` | REMOVE_NOW | **removed** (0 callers) | — |
| `company-user.guards.ts` | `assertSelfEditNotAllowed` | REMOVE_NOW | **removed** | — |
| `bot-response.builder.ts` | `ATTENDANCE_LOCATION_MIXED_AMBIGUOUS_MESSAGE` | REMOVE_NOW | **removed** | — |
| `attendance-notification.repository.ts` | `reserveNotification` / `reclaimNotification` / `failPending…` | REMOVE_NOW | **removed** | — |
| `payroll-receipt-notification.repository.ts` | deprecated `markSent` | REMOVE_NOW | **removed** | — |
| `one-time-…reconciliation.service.ts` | `oneTimeOperationScheduleReconciliationService` | REMOVE_NOW | **removed**; callers → command/repair | — |
| `legacy-operation-session-context.ts` | read compat | MIGRATION_COMPAT | KEEP | remove when no pre-rename sessions remain |
| `types/twilio.types.ts` | @deprecated session fields | MIGRATION_COMPAT | KEEP | same |
| `whatsapp-company-context` default company | TEMPORARY_WITH_EXPIRY | KEEP | TODO phase-1.7 multi-company mapping | owner: WhatsApp tenancy |
| `env COMPANY_PROTECTED_NAMES` | KEEP_INTENTIONAL | KEEP | documented deprecated prefer IDs | — |
| `health.controller` `/health/database` | KEEP_INTENTIONAL | KEEP | deploy probes | — |
| `absence` `requiresAttachment` | MIGRATION_COMPAT | KEEP | mirrors attachmentPolicy | — |
| `attendance-validation` `_onTimeGraceMinutes` | INTERFACE_REQUIRED | KEEP | call-site compat; policy documented | — |
| `uuid` npm override | KEEP_INTENTIONAL | KEEP | Phase 4 condition | — |
| Google SDK compatibility tests | KEEP_INTENTIONAL | KEEP | regression for override | — |

Full greps covered `legacy|deprecated|compat|TODO|FIXME|workaround|hack` under `backend/src`; no silent “legacy” left unclassified in productive paths touched this phase.

---

## Code changes this phase

1. **REMOVE_NOW** dead aliases / wrappers (list above).  
2. **Caller migration:** `operation.service` → `oneTimeScheduleReconciliationCommand`; repair callers → `oneTimeScheduleRepairService`.  
3. **Scanner recalibration:** SOLID SRP no longer treats repository SQL as a mixed-responsibility signal (Phase 5 boundary).  
4. **Fix** `npm run audit:dead-code` (was wrongly wired to env-consistency).  
5. **Framework tests:** baseline same-key → gate pass; new high confirmed → regression fail; resolved disappears.

No new npm dependencies. No business-rule / copy changes. No ORM / Clean Architecture rewrite.

---

## Findings before / after (framework partials)

| Scan | Before (Phase 6 end) | After Phase 7–8 |
| --- | ---: | ---: |
| god-classes | 17 | (re-run in gates) |
| solid | 27–28 (mostly repos) | reduced (repos not SRP-flagged for SQL alone) |
| grasp | 3 | ~same |
| complexity | 5 | ~same |
| reliability | 0 | 0 |

Full `npm run audit` counts captured into baseline files after green gates.

---

## Resolved debt

- Dead absence `create` forwarder  
- Dead company-user alias  
- Dead mixed-attendance ambiguous constant  
- Dead notification claim/supersede aliases  
- Dead payroll `markSent` alias  
- Deprecated one-time reconciliation service facade  
- Miswired `audit:dead-code` script  
- Repository SOLID SRP false positives from SQL ownership  

## Accepted debt (explicit)

- Large cohesive services (assignment, payroll, reminders, materialization, calendar) — KEEP_COHESIVE  
- Session read-compat for renamed operation context — MIGRATION_COMPAT  
- Default WhatsApp company fallback — TEMPORARY until multi-company routing  
- Deploy health alias — KEEP_INTENTIONAL  
- Pre-existing integration failures (multi-company / settings / tenant) — not Phase 7–8 scope  

---

## Gates (execution evidence)

| Command | Result |
| --- | --- |
| backend lint | PASS |
| backend build | PASS |
| backend unit | **1289 pass / 0 fail** |
| test:audit-framework | **46 OK** |
| integration | **340 / 330 pass / 9 fail / 1 skip** (same 9 pre-existing; new=0) |
| audit:solid | **10** findings (was ~27–28; repo SQL FP removed) |
| audit:god-classes | 17 findings, blocking=0 |
| audit:security:fast | secrets=0 missing_docs=0 |
| npm audit backend/frontend | **0 vulnerabilities** |
| audit:reliability | 0 |
| npm run audit | blocking=0 |
| npm run audit:baseline | saved official baseline |
| baseline reproduce | **188 vs 188; new=0 resolved=0 severity_changed=0** |
| npm run audit:strict | **Quality gate PASSED** |

---

## FINAL TECHNICAL BASELINE

```text
Hotspots reviewed: 13
Hotspots refactored (targeted): absence dead create + operation reconcile caller migration
Cohesive hotspots intentionally kept: 11

Legacy markers reviewed: 40+
Removed (REMOVE_NOW): 8
Intentional / migration compat: classified
Temporary with expiry: WhatsApp default company (phase-1.7)

Confirmed races unresolved: 0 (this phase)
Confirmed SQL injection unresolved: 0
New tenant violations: 0
New dependency critical/high: 0
New circular dependencies: 0

Backend lint: PASS
Backend build: PASS
Backend unit: PASS (1289/0)
DB integration: EXECUTED (340/330/9/1)
New integration regressions: 0

Audit findings final (baseline):
  total: 188
  high: 1 (health.controller db-probe — KEEP_INTENTIONAL readiness)
  medium: 57
  low: 98
  info: 32
  statuses: requires-review=110 detected=27 suspected=38 accepted-risk=13

Baseline regenerated: YES
Baseline reproducible: YES (188 identical keys)
Strict regression gate: PASS
Framework proof: new high confirmed → strict fail (unit)
```
