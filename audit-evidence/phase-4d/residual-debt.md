# Phase 4D — Residual debt

## P1

- `checkout-attendance.flow` / `attendance-reminder.service` remain PARTIALLY_REMEDIATED (4C).
- WhatsApp multi-company routing `TODO(phase-1.7)` still required.
- Deprecated invitation GET preview retained (4A compat).

## P2

- Remaining bare `error.message.includes(UQ_…)` call sites outside the remediates set (e.g. work-team, absence-balance).
- operation-assignment / recurring / invitation accept complexity deferred.
- Audit `as unknown as Record` dumps justified.

## P3

- `@deprecated` aliases; test-only Request casts; TAP `--test-force-exit` noise.
