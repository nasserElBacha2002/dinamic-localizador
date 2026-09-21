# 4B.1 — Audit methodology

Search commands used to build `job-inventory.md` (reproducible; not claimed exhaustive beyond these patterns):

```bash
# Process-local concurrency guards
rg -n 'isRunning|let running' backend/src/jobs backend/src/services --type ts

# Schedulers
rg -n 'setInterval|setTimeout|cron|schedule' backend/src/jobs --type ts

# Existing distributed fencing
rg -n 'withDedicatedSessionAppLock|sp_getapplock|lease_|claimNext|lockSkipped' backend/src --type ts

# Job entrypoints
ls backend/src/jobs/*.ts
```

Classification rule:

- **already distributed-safe** — row lease / session app lock / CAS is the authority
- **process-local guarded** — only `isRunning` (or equivalent) before remediation
- **idempotent without lock** — CAS/promote with documented multi-instance safety
- **unsafe** — side effects without distributed fence

Remediated targets: `recurring-workday-materialization`, `attendance-reminder` tick fencing via existing `withDedicatedSessionAppLock`.
