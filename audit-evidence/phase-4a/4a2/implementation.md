# 4A.2 — Invitation token + logging

## Root cause
GET `/invitations/preview?token=` logged raw URL via `morgan("dev")`.

## Fix
- Central `sanitizeUrlForLogs` + morgan `:safe-url` via `createAccessLogger`.
- Preferred `POST /invitations/preview` with body `{ token }`.
- Legacy GET retained for deep links; query token redacted in access logs.
- Frontend `previewInvitation` uses POST.
- Browser already strips token from URL after persist (unchanged).

## Token lifecycle
Existing hash + single-use accept/CAS + expiry preserved (not weakened).
