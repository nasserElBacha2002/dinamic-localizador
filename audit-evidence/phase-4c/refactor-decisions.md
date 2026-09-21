# Phase 4C — Refactor decisions

## Extracted

1. **`checkout-result-code.ts`**
   - Pure mapping: `CheckoutStatus` + exit-without-arrival → WhatsApp `resultCode`.
   - Improves: SRP, testability, removes duplicated ternaries in flow.

2. **`checkout-simulation-attendance.ts`**
   - Dry-run `VirtualAttendanceRecord` → durable-shaped `AttendanceRecord`.
   - Improves: cohesion of simulation adapter; removes ~80 duplicated LOC in two paths.

3. **`attendance-reminder-outcomes.ts`**
   - `classifyReminderSendOutcome`, kind-count empty/merge.
   - Improves: pure aggregation away from Twilio send pipeline; documents `sent_*` partial-failure counters.

## Reused (not recreated)

- `checkout-validation` / `buildCheckoutValidation*`
- `geofencePolicyResolver` / `evaluateAttendanceCheckIn` (4A)
- `employeeWorkdayCheckoutCommand` for persistence

## Deferred (justified)

| Module | Why defer |
|--------|-----------|
| recurring-workday | 4B applock path; split without deep characterization risks lease regressions |
| operation / assignment | Core already extracted; god risk lower than checkout; need coverage-batch tests first |
| absence / invitation / payroll | Recent 4A/4B security/reliability work; maintainability-only |

## Abstractions not created

No `AttendanceValidatorV2`, no state-machine library, no new god facade.

## Side-effect model (documented, not redesigned)

Checkout: **evaluate → durable command → outbound respond** (best-effort notify; comment preserved).

Reminder: Twilio accept + context/persist failure → `sent_context_failed` / `sent_persistence_unknown` (already 4B-aligned).
