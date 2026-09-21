# CORS policy review (LOC-P1-006)

## Clients

| Client | Sends Origin? | Auth |
|--------|---------------|------|
| React SPA (browser) | Yes (frontend origin) | Bearer JWT |
| Twilio WhatsApp webhook | Typically no | X-Twilio-Signature |
| Health/monitoring | Typically no | none / network |
| Internal scripts | Typically no | env / JWT |

## Policy

- Allowlist: `FRONTEND_URL` + `CORS_ALLOWED_ORIGINS` → `env.corsOrigins`.
- Unknown browser Origin → no `Access-Control-Allow-Origin` (request may still hit handler; auth decides access).
- Missing Origin → CORS allows through; **not** treated as malicious.
- Credentials on CORS: **false** (Bearer in Authorization header).
- Wildcard `*` with credentials: **not used**.

## Preflight

Allowed methods: GET/POST/PUT/PATCH/DELETE/OPTIONS.  
Allowed headers exercised in tests: Authorization, Content-Type.

## Evidence

`backend/src/config/cors-policy.http.test.ts`, `cors-origins.test.ts`.

## Note

CORS is a browser boundary, not authentication. Do not claim “security bypass fixed” from CORS alone.
