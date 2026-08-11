# Payroll multiple receipts — validation

**Status:** `IMPLEMENTED_WITH_ISSUES`  
**Date:** 2026-08-07  
**Corrections detail:** `audit/payroll-multiple-receipts-corrections-validation.md`

## Commands (corrections pass)

| Command | Exit | Notes |
|---------|------|-------|
| `backend npm run migrate` | 0 | 085 + 086 applied |
| `backend npm run migrate:status` | 0 | 086 applied |
| payroll-multiple-receipts.integration.test.ts | 0 | 6 SQL tests |
| payroll-receipt*.service.test.ts + file-validation | 0 | pass |
| `backend npm run build` | 0 | pass |
| `backend npm test` | 0 | 1211 pass |
| `backend npm run lint` | 1 | pre-existing repo errors; feature files clean |
| frontend payroll eslint + labels test + build | 0 | pass |

## Acceptance (post-corrections)

1. Multi ASSOCIATED per period — migration + SQL tests  
2. Checksum unique — `UX_payroll_receipts_active_checksum` + SQL concurrent same-checksum  
3. Permanent partial never `completed` — unit test  
4. Period isolation in same session — unit + SQL  
5. ensurePendingDeliveries concurrent idempotent — SQL  
6. ACCEPTED semantics — migration CK + service  
7. Replace/delete target-only — unit tests  
8. Object keys include receiptId — file-validation test  

## Residual

- Full backend lint red (pre-existing).  
- Rollback of period unique unsafe with multi ASSOCIATED.  
- ACCEPTED ≠ Twilio delivered callback.
