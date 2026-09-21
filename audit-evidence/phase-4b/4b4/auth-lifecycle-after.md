# 4B.4 — Auth lifecycle (after)

- `POST /auth/logout` bumps `token_version`.
- Frontend `logout()` returns `LogoutResult`:
  - `serverRevoked: true` on HTTP 200 or 401 INVALID_TOKEN/UNAUTHORIZED
  - `serverRevoked: false` on network/5xx (`reason` set)
- AuthContext always clears local token; logs when remote revocation unconfirmed.
- Authenticate uses live DB identity (role/email).
- LOC-P1-015 remains **PARTIALLY_REMEDIATED** (no refresh-token/session table).
- CQ-004 remains **RESIDUAL** (JWT still in localStorage).
