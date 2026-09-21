# Public / conditionally public endpoints

Derived from `backend/src/routes/index.ts` + route files. Full suffix list in `endpoint-inventory.csv`.

## INTENTIONALLY_PUBLIC

| Method | Path | Notes |
|--------|------|-------|
| * | `/api/health` (and health router paths) | Liveness |
| POST | `/api/auth/login` | Rate limited |
| POST | `/api/auth/login/2fa` | Rate limited |
| POST | `/api/auth/forgot-password` | Rate limited; anti-enumeration pattern |
| POST | `/api/auth/reset-password` | Rate limited |
| GET/POST | `/api/invitations/...` preview/accept/decline | Tokenized; rate limited; optional auth |

## CONDITIONALLY_PUBLIC

| Method | Path | Gate |
|--------|------|------|
| POST | `/api/webhooks/twilio/whatsapp` | Twilio request signature vs `TWILIO_WEBHOOK_URL` |
| POST | `/api/webhooks/twilio/whatsapp/status` | Separate signature vs `TWILIO_STATUS_CALLBACK_URL` |

## Authenticated (not public)

All other mounts under `/api/companies`, `/api/platform`, and legacy operational router require `authenticate`.

## SUSPICIOUS / review notes

- **CORS** allows requests with **no `Origin` header** (`app.ts`) — common for non-browser clients; with Bearer tokens classic CSRF is reduced but still document.
- **Dev SQL port** `1435:1433` published in `docker-compose.yml` (dev). Prod compose overrides SQL ports to empty.
- **Dev reminder routes** return 404 in `NODE_ENV=production` (`dev-reminder.routes.ts`).
