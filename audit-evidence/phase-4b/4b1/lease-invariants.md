# 4B.1 — Lease invariants

- At most one owner per lock resource (exclusive session lock; timeout 0 → skip).
- Crash recovery: session lock dies with SQL connection (no permanent `running` flag).
- Scope isolation: distinct resources for materialization vs reminder.
- Lease ≠ exactly-once Twilio/email; see residual-risks.md.
