# Retest original DAST payload

Payload with contradictory client VALID + INSIDE + distanceMeters=1 + far coords:

1. Zod `.strict()` → 400 VALIDATION_ERROR if derived fields present (TRUSTS_CLIENT_STATE=false at contract).
2. Evidence-only body with far coords → persisted REJECTED/OUTSIDE with server distance (~500m).

Result: **PASS** (TRUSTS_CLIENT_STATE = false)
