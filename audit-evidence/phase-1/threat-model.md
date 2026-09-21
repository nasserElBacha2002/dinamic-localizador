# Threat model (practical)

## Actors

| Actor | Capabilities |
|-------|----------------|
| Unauthenticated Internet | Hit public auth/invitation/Twilio webhook URLs |
| Compromised Twilio credential / forged webhook without valid signature | Blocked if signature validation + correct webhook URL configured |
| Employee (WhatsApp phone) | Check-in/out, absences via bot; spoof GPS on device |
| Company operator (membership roles) | CRUD within tenant per permissions |
| Company OWNER/ADMIN | User/role management, settings, manual attendance if permitted |
| Platform admin | Cross-tenant observability, bot simulator, company lifecycle |
| Background job process | Reminder/alert/retention side effects |
| Insider with DB access | Bypass app entirely |
| Multi-company user | Must not pivot without membership |

## Assets

- Attendance truth (arrival/departure, sources, reviews)
- Employee PII (phone, documents, location)
- Company operational data (operations, assignments, payroll PDFs)
- WhatsApp conversation content / costs
- Auth secrets (JWT, Twilio, DB, SMTP, GCS)

## Entry points

- `/api/auth/*`, `/api/invitations/*`
- `/api/webhooks/twilio/*`
- `/api/companies/:companyId/**` and legacy `/api/**`
- `/api/platform/**`
- Job loops inside backend process
- Import/upload endpoints

## Privilege boundaries

1. Twilio signature ≠ user auth
2. Platform admin ≠ company membership (synthetic membership)
3. Module disabled ≠ permission missing (both enforced)
4. Frontend company switcher ≠ backend membership check

## High-value actions

- Manual attendance create/edit
- Attendance review approve/reject
- Payroll upload/download
- Invitation accept (account creation)
- Password reset
- Reveal phone (platform observability)
- Company delete lifecycle
