# 4B.1 — Job inventory

| Job | Guard | Classification |
|---|---|---|
| recurring-workday-materialization | session app lock (`runScheduledTick`) | remediated |
| attendance-reminder | session app lock + notification CAS | remediated |
| rate-limit-cleanup | session app lock | already distributed-safe |
| whatsapp-retention-cleanup | session app lock | already distributed-safe |
| system-log-retention | session app lock | already distributed-safe |
| daily-attendance-report | row lease | already distributed-safe |
| admin-alert | row lease | already distributed-safe |
| payroll-receipt-notification | row lease | already distributed-safe |
| operation-assignment-notification | row lease | already distributed-safe |
| absence-workday-sync | row lease | already distributed-safe |
| absence-attachment-cleanup | row lease | already distributed-safe |
| company-deletion | row lease | already distributed-safe |
| whatsapp-message-cost-sync | row lease / batch claim | already distributed-safe |
| operation-lifecycle | CAS promote | idempotent without exclusive lock |

Inventoried: 14 · Unsafe before: 2 · Remediated: 2 · Remaining unsafe-only process-local: 0
