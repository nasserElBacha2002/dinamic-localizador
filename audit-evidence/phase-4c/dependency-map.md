# Phase 4C — Dependency map (priority modules)

## checkout-attendance.flow

**Incoming:** WhatsApp bot handlers / conversation router.

**Outgoing:**

- `attendance.repository` (read check-in)
- `employeeWorkdayCheckoutCommand` (durable write)
- `bot-session.service`, `bot-workday.selector`, `bot-attendance-runtime` (validation builders)
- `checkout-validation` (via runtime builders) — **policy reused, not duplicated**
- `bot-outbound-response` / observability

**Cross-layer:** none into controllers; util→service not introduced.

**Circular:** none.

## attendance-reminder.service

**Outgoing:** notification repo, Twilio outbound, bot-session, company/operation repos, template utils, flow-trace.

**Circular:** none with checkout flow.

## operation.service / operation-assignment.service

**Outgoing:** assignment core shared by assignment + absence conflict + work-team.

**Circular operation ↔ assignment:** **not present** (assignment does not import `operation.service`).

## Intentionally unchanged

Controllers → repositories: not introduced by 4C.
Domain → Twilio: remains in reminder/checkout orchestrators (expected adapters).
