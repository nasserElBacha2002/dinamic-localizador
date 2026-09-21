# Phase 4C — Residual risks

## P1

- `checkout-attendance.flow` remains a large multi-responsibility orchestrator (~1252 LOC) — **PARTIALLY_REMEDIATED**, not eliminated.
- `attendance-reminder.service` send/eligibility/Twilio pipeline remains (~1177 LOC) — **PARTIALLY_REMEDIATED**.

## P2

- `operation-assignment.service` / `operation.service` / `recurring-workday-materialization.service` intentionally deferred.
- Further checkout/reminder splits need more characterization before touching session/selection paths.

## P3

- absence / invitation / payroll maintainability debt unchanged (deferred).
- Frontend hook dependency warnings unrelated to 4C.

## Partial-failure (documented, unchanged)

- Checkout outbound after durable commit remains best-effort.
- Reminder `sent_context_failed` / `sent_persistence_unknown` counted as sent.
