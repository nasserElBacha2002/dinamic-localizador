# Feature 3 — Approve with insufficient balance

**Status:** IMPLEMENTED_WITH_ISSUES (post-review corrections)

## Summary
- `PATCH /absence-requests/:id/approve` body `{ allowInsufficientBalance?: true }`.
- Backend skips balance gate when override; audit includes `balanceApprovalOverride`, `balanceBefore`, `balanceAfter`, `requestedDays`, `approvedByUserId`, `approvedAt`.
- UI: warnings + **Aprobar igualmente** modal.

## Tests
- `absence-balance.service.test.ts` — gate skip with override (DB section when enabled)
- **Missing:** full approve flow asserting ledger balance −35 (0 balance, 35-day request)

## Validation
- `cd backend && npm run build` — pass
- `cd frontend && npm run build` — pass
