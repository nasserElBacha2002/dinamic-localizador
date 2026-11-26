# Security / HTTP validation (DIN-463 corrections)

## Implemented controls

- Commercial seat mode updates only via platform billing routes (`billing-commercial.controller.ts`); generic company settings schemas do not expose `commercialSeatQuotaMode`.
- Company ENFORCE gated on global ENFORCE.

## Verification

| Check | Result |
|-------|--------|
| Grep schemas for `commercialSeatQuota` | not in generic company PATCH |
| HTTP integration (platform admin vs company admin) | **not executed** in this pass |

## Residual

Add or extend integration/HTTP tests for 403 on non-platform users when hardening acceptance gate.