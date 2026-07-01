# Multi-company Phase 1.2 — tenant isolation hardening

This document records the audit and hardening pass after Phase 1 multi-company foundation and the scoped frontend API client.

## Architecture summary

```
Browser
  → CompanyProvider / CompanyGate (active company required)
  → scopedApiClient (operational paths → companies/:activeCompanyId/...)
  → Backend authenticate → resolveCompanyContext → requirePermission
  → Services (companyId from request context only)
  → Repositories (explicit company_id in every operational query)
  → SQL Server (company_id NOT NULL on operational tables)
```

## Platform superadmin

- `users.is_platform_admin = 1` (migration `016`)
- Can access any **active** company via `/api/companies/:companyId/...` without a membership row
- Receives synthetic **OWNER** permissions at runtime
- On **legacy flat routes** (`/api/employees`, etc.): must select a company when more than one active company exists → `409 COMPANY_SELECTION_REQUIRED`

## Company context rules

| Scenario | Behavior |
|----------|----------|
| Regular user, 1 membership | Legacy flat route auto-resolves; company-scoped route validates membership |
| Regular user, N>1 memberships | Legacy flat route → `409`; must use `/api/companies/:companyId/...` |
| Regular user, 0 memberships | `403 NO_COMPANY_MEMBERSHIP` |
| Platform admin, N>1 active companies | Legacy flat route → `409` |
| Platform admin, explicit `:companyId` | Allowed for any active company |
| User without membership on `:companyId` | `403 COMPANY_ACCESS_DENIED` |

Route registration order (critical): company-scoped mount **before** legacy flat `operationalRouter`.

## Frontend scoped API rules

Operational API modules use `scopedApiClient`, which calls `scopedApiPath`:

- `employees`, `stores`, `inventories`, `attendance`, `statistics`, `absence-types`, `absence-requests`, `bot-simulator`, `dev` → prefixed with `companies/:activeCompanyId/`
- `auth`, `companies`, `health`, `webhooks`, `database` → unchanged
- Already company-scoped paths → unchanged
- No active company → `ActiveCompanyRequiredError` (`ACTIVE_COMPANY_REQUIRED`)

Hooks use `useOperationalQueryEnabled`:
- `companyId` in `queryKey` only (cache isolation)
- `enabled` blocks queries until active company exists
- API functions do **not** accept `companyId`

## Permissions matrix (company role)

| Permission | Typical roles |
|------------|---------------|
| `employees:read` / `employees:manage` | HR+, OWNER |
| `stores:read` / `stores:manage` | SUPERVISOR+, OWNER |
| `inventories:read` / `inventories:manage` | OPERATOR read; SUPERVISOR+ manage |
| `attendance:read` / `attendance:review` / `attendance:export` | OPERATOR read; SUPERVISOR review; export per role map |
| `absences:read` / `absences:review` | HR read/review |
| `reports:read` | All read roles |
| `company:read` / `company:settings:update` | READ_ONLY read; OWNER/ADMIN update |

Global `users.role = ADMIN` is **not** used for operational authorization. Use `requirePermission` after `resolveCompanyContext`.

## Legacy route deprecation

Flat routes remain temporary compatibility:

```
/api/employees
/api/stores
/api/inventories
...
```

**Frontend must not call these.** DevTools should show only `/api/companies/:companyId/...` for operational data.

Backend still enforces:
- Single company → allowed on legacy path
- Multiple companies → `409 COMPANY_SELECTION_REQUIRED`

## Repository hardening (Phase 1.2)

Explicit `company_id` filters applied or strengthened in:

- `employee.repository.ts` — `last_worked_at` subquery scoped by company
- `absence-request.repository.ts` — event insert validates parent request; performer join scoped
- `inventory-attendance.repository.ts` — excludes simulation rows (`is_simulation = 0`)
- `inventory.repository.ts` — employee join defense-in-depth

All other operational repositories were audited and already scope by `company_id`.

## WhatsApp inbound (documented limitation)

Inbound Twilio webhooks resolve tenant via `BOT_DEFAULT_COMPANY_ID` / `BOT_DEFAULT_COMPANY_NAME` or single-company heuristic. This is intentional for Phase 1:

- Production single-tenant or configured default company → works
- Multi-company production WhatsApp disambiguation (per Twilio number, employee selection) → **deferred**

Employee phone uniqueness is **per company** (`UQ_employees_company_phone_number`).

## Database integrity

Migrations `015`–`018` provide:

- `companies`, `user_company_memberships` (UNIQUE user+company), `company_settings`, `company_modules`
- `company_id NOT NULL` on operational tables with FKs
- Tenant indexes, e.g. `IX_employees_company_id`, `IX_inventories_company_store_start`, `IX_attendance_records_company_employee_inventory_received`

## Automated checks

| Check | Location |
|-------|----------|
| Frontend scoped API audit | `frontend/src/api/company-path.test.ts` |
| Frontend company selection logic | `frontend/src/context/company-resolution.test.ts` |
| Legacy bot company selection | `backend/src/services/company-legacy-context.test.ts` |
| Tenant isolation integration | `backend/src/services/tenant-isolation.integration.test.ts` |
| Static tenant audit script | `scripts/audit/audit_tenant_isolation.py` → `audit/tenant-isolation-audit.txt` |

Run audit:

```bash
python3 scripts/audit/audit_tenant_isolation.py
```

## Manual verification checklist

### Superadmin
- [ ] Login as `admin@dinamicsystems.com`
- [ ] Selector appears when multiple companies exist
- [ ] Network shows `/api/companies/:companyId/...` only
- [ ] Switch company clears stale data

### Single-company user
- [ ] Auto-selects company, dashboard loads, no 409

### Multi-company user
- [ ] Selector appears; no operational requests before selection

### Cross-tenant
- [ ] URL with foreign `companyId` → `403 COMPANY_ACCESS_DENIED` (non-member)
- [ ] Superadmin can access foreign `companyId`

### Read-only user
- [ ] Can read; cannot mutate without permission

## Deferred (out of scope)

- Rename `inventories` / `stores` → operations / locations
- Rename `inventory_id` / `store_id`
- Generic Excel import redesign
- WhatsApp employee portal
- WhatsApp multi-company resolution by receiver number
- `company_modules` enforcement on every route
- Email invitation flow for new company users
- Employee self-service web accounts

See [PLATFORM_COMPANY_MANAGEMENT.md](./PLATFORM_COMPANY_MANAGEMENT.md) for platform superadmin company creation.

## Related docs

- [MULTI_COMPANY_PHASE1.md](./MULTI_COMPANY_PHASE1.md) — initial Phase 1 implementation notes
