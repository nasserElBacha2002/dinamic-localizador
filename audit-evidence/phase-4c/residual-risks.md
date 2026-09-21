# Phase 4C — Residual risks

## P1

- `checkout-attendance.flow` remains a large orchestrator (~1252 LOC): selection/session/error paths still colocated.
- `attendance-reminder.service` send pipeline still mixes eligibility revalidation + Twilio + claim updates (intentional; only pure counters extracted).

## P2

- `operation-assignment.service` / `operation.service` / `recurring-workday-materialization.service` still large; deferred pending characterization.
- Simulation boundary still uses status casts (`VirtualAttendanceRecord` stores strings) — justified adapter, not eliminated.

## P3

- absence / invitation / payroll maintainability debt unchanged.
- Frontend hook dependency warnings unrelated to 4C.

## Partial-failure

- Checkout outbound after durable commit remains best-effort (documented).
- Reminder `sent_context_failed` / `sent_persistence_unknown` remain counted as sent (behavior preserved).
