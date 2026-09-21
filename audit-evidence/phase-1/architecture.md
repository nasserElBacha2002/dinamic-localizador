# Architecture reconstruction

## Repository layout

- `backend/` — Node.js / Express / TypeScript API, jobs, Twilio webhook
- `frontend/` — React / Vite operator UI
- `database/migrations/` — SQL Server migrations (~141 numbered scripts observed)
- `scripts/audit/` — Internal static audit framework (architecture + light security)
- `docker-compose.yml` / `docker-compose.prod.yml` — SQL Server, migrations, backend, frontend
- `.github/workflows/` — `pr-validation.yml`, `quality-gate.yml`, deploy backend/frontend

## Synchronous HTTP path

```
Client
 → Helmet / CORS / Morgan / requestId / body parsers (app.ts)
 → /api router (routes/index.ts)
 → [optional] authenticate (Bearer JWT)
 → [company routes] resolveCompanyContext + loadCompanyModuleStates
 → requireCompanyModule / requirePermission (per route)
 → validate(zod schema)
 → controller → service → repository (mssql parameterized)
 → JSON response | AppError via errorHandler
```

Mount points (`backend/src/routes/index.ts`):

1. **Public / special**
   - `/api` health
   - `/api/auth/*`
   - `/api/invitations/*` (public invitation router)
   - `/api/webhooks/twilio/*` (Twilio signature middleware)
2. **Authenticated platform**
   - `/api/companies`, `/api/platform/*`, observability WhatsApp/system-logs
3. **Company-scoped operational (preferred)**
   - `/api/companies/:companyId/...` + `resolveCompanyContext`
4. **Legacy operational (authenticated, company from membership / single active company)**
   - `/api/...` after global `authenticate` + `resolveCompanyContext` without path companyId

## AuthN

- JWT Bearer (`authenticate.ts`) verified with `JWT_SECRET`
- Session invalidation via `user.tokenVersion` (`isSessionValid`)
- Default expiry `JWT_EXPIRES_IN=8h` (`env.ts`)
- Login / 2FA / password reset rate-limited (`rate-limit.ts`, **in-memory Map per process**)
- Password verify uses dummy hash for unknown emails (timing-ish mitigation)

## AuthZ

- **Platform:** `isPlatformAdmin` + `requirePlatformAdmin`
- **Company:** membership role → `resolvePermissionsForRole` → `req.permissions`
- Route guards: `requirePermission` / `requireAnyPermission` / module gates
- JWT `role` is legacy `UserRole = "ADMIN"`; real RBAC is company membership (OWNER/ADMIN/SUPERVISOR/…)

## Multi-tenant

- Preferred: `companyId` from path validated against membership (or synthetic platform membership)
- Repositories for attendance/employees typically take `companyId` as first argument
- WhatsApp inbound resolves company via phone/session (`whatsapp-company-context.service.ts`)
- Global SID/UUID lookups exist for webhook correlation / platform observability (cross-tenant by design for platform admin)

## Async / jobs (`backend/src/jobs/`)

Observed schedulers (setInterval / worker loops):

- attendance-reminder
- admin-alert
- daily-attendance-report (DB leases)
- operation-lifecycle
- operation-assignment-notification
- recurring-workday-materialization
- absence-workday-sync / absence-attachment-cleanup
- company-deletion
- payroll-receipt-notification
- system-log-retention
- whatsapp-retention-cleanup
- whatsapp-message-cost-sync

Lease pattern example: `daily-attendance-report-*.repository.ts` (`lease_owner`, `lease_expires_at`).

## WhatsApp

```
Twilio POST /api/webhooks/twilio/whatsapp
 → validateTwilioSignature (TWILIO_WEBHOOK_URL)
 → parse inbound
 → resolve company/employee/session
 → MessageSid persistence / unique indexes
 → bot flow (check-in / check-out / absences)
 → TwiML / outbound
```

## Frontends trust boundary

- `scopedApiClient` + `activeCompanyId` for operational APIs
- Authorization must not rely on UI alone (backend is authority)


## Follow-up notes (architecture exploration)

- **No logout / refresh endpoints** under `backend/src/routes/` — session ends on JWT expiry or `token_version` bump (password reset / 2FA rotation).
- **Platform admin synthetic membership** uses role `OWNER` (`utils/platform-admin-membership.ts`) → full company permission set when accessing any company.
- Jobs run **in-process** with the API (`server.ts` setInterval workers).
- Latest migration observed: `139_attendance_manual_registration.sql` (~141 numbered migrations).
- Upload/export surfaces: imports (Base64 JSON ~7MB), attendance CSV, statistics export, absence/payroll multipart, platform cost CSV.
