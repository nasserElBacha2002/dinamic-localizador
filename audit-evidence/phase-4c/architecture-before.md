# Phase 4C — Architecture before

Baseline (LOC measured at start of 4C implementation):

| Module | LOC | Primary responsibilities (observed) | God-module? |
|--------|-----|-------------------------------------|-------------|
| checkout-attendance.flow | ~1313 | WhatsApp checkout orchestration: selection, location, simulation hydration, durable command call, observability codes, outbound respond | **Yes** — orchestration + mapping + observability |
| attendance-reminder.service | ~1189 | Candidate windows, claim/send Twilio, session gates, outcome counters, company fan-out | **Yes** — schedule + send + aggregation |
| operation-assignment.service | ~1196 | Assignment CRUD/batch, coverage, reassignment; already uses `operation-assignment-core` | Partial — large but partially split |
| recurring-workday-materialization.service | ~1181 | Materialize recurring workdays, locks (4B), schedule math | Yes — deferred (high risk / lock-sensitive) |
| operation.service | ~1088 | Operation CRUD/queries/schedule facets | Partial — deferred |
| user-invitation.service | ~1034 | Token lifecycle, email, membership (4A hardened) | Yes — deferred (security-sensitive) |
| absence-request.service | ~976 | Lifecycle/approval/balance (4B error semantics) | Yes — deferred |
| payroll-receipt.service | ~950 | Storage/auth/file/query; notifications already extracted | Partial — deferred |

## Already-good seams (do not duplicate)

- `utils/checkout-validation.ts` — checkout status decisions
- `utils/evaluate-attendance-check-in.ts` / `geofence-policy.resolver.ts` — 4A geofence/check-in
- `employee-workday-checkout.command.ts` — durable persist path
- `operation-assignment-core.service.ts` — shared assignment rules
- `invitation-email.ts`, payroll notification/delivery services — prior side-effect splits

## Dependency notes

- No `operation.service` ↔ `operation-assignment.service` circular import found.
- Checkout flow → repository + checkout command + Twilio respond (orchestration, not policy duplication).
