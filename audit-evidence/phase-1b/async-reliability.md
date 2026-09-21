# Async / reliability

- Reminder/assignment: claim → send → mark (I/O outside TX) — good.
- Process-local `isRunning` + uneven leases — LOC-P1-004.
- Rate limit in-memory — LOC-P1-001.
- No unbounded `Promise.all` on user-controlled arrays confirmed in sampled paths.
- Reliability scanner returned 0 this run (high FN risk) — do not treat as clean.
