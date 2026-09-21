# Complexity analysis

Scanner: `complexity.py` (LOC thresholds 800/1200; token density heuristic).

## Medium+ large files (scanner)

- `backend/src/repositories/attendance-notification.repository.ts` — Large file (1295 LOC)
- `backend/src/repositories/employee-workday.repository.ts` — Large file (1299 LOC)
- `backend/src/services/bot/checkout-attendance.flow.ts` — Large file (1313 LOC)
- `backend/src/services/operation-assignment.service.ts` — High control-flow token count (106)
- `backend/src/services/recurring-workday-materialization.service.ts` — High control-flow token count (99)
- `backend/src/services/whatsapp-bot.service.ts` — High control-flow token count (84)

## Top services by LOC (manual)

- 1313 LOC — `backend/src/services/bot/checkout-attendance.flow.ts`
- 1196 LOC — `backend/src/services/operation-assignment.service.ts`
- 1189 LOC — `backend/src/services/attendance-reminder.service.ts`
- 1161 LOC — `backend/src/services/recurring-workday-materialization.service.ts`
- 1088 LOC — `backend/src/services/operation.service.ts`
- 1034 LOC — `backend/src/services/user-invitation.service.ts`
- 950 LOC — `backend/src/services/payroll-receipt.service.ts`
- 949 LOC — `backend/src/services/absence-request.service.ts`
- 942 LOC — `backend/src/services/bot-session.service.ts`
- 845 LOC — `backend/src/services/daily-attendance-report.service.ts`
- 816 LOC — `backend/src/services/whatsapp-bot.service.ts`
- 793 LOC — `backend/src/services/work-team-assignment.service.ts`

## Interpretation

Much of WhatsApp attendance / assignment / materialization complexity is **domain-inherent** (state + TX + provider I/O). Risk is change/regression cost, not automatic defect. Prefer CQ findings only where complexity hides divergent business rules (see CQ-001).
