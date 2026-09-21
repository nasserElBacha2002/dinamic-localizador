# 4B.4 — Security invariants

| Event | Effect |
|---|---|
| Confirmed logout (200) | token_version++; old JWT 401 |
| Logout 401 already invalid | treated as serverRevoked (token unusable) |
| Logout network/5xx | local clear only; serverRevoked=false (observable) |
| Password reset | version bump |
| User inactive | rejected |
| Company role | DB membership |
| localStorage XSS | CQ-004 residual |
