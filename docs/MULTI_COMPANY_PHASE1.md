# Multi-company Phase 1 — implementation notes

This phase adds tenant isolation (companies, memberships, settings, permissions) without renaming domain concepts.

## Intentionally deferred

- **inventories / stores → operations / locations** rename
- **inventory_id / store_id** rename
- Generic Excel import redesign
- WhatsApp multi-company resolution by Twilio receiver number, employee phone, or user selection
- Full **company_modules** enforcement in every route (minimal table + `GET /api/companies/:companyId/modules` is implemented; frontend nav hiding is optional follow-up)

## Platform superadmin

- `admin@dinamicsystems.com` is backfilled with `users.is_platform_admin = 1` (migration `016_platform_superadmin.sql`).
- Runtime checks prefer `users.is_platform_admin`, not email alone.
- Platform superadmin can access any active company without a `user_company_memberships` row and receives effective **OWNER** permissions.

## Legacy flat routes

Flat routes (`/api/employees`, etc.) remain temporarily for backward compatibility.

- Single available company → allowed.
- Multiple companies → `COMPANY_SELECTION_REQUIRED`; use `/api/companies/:companyId/...`.
- Applies to platform superadmin as well unless an explicit bot/default company is configured for WhatsApp.

## Permissions model

Access is **authenticated user + active company + company permission**, not global `users.role = ADMIN`.

Operational routes use `requirePermission(...)` after `resolveCompanyContext`.

## Migrations

- `015_multi_company_foundation.sql` — core tables, nullable `company_id`, backfill, constraints
- `016_platform_superadmin.sql` — `is_platform_admin`
- `017_company_modules.sql` — minimal modules table
- `018_multi_company_backfill_validation.sql` — throws if any operational row lacks `company_id`

Employee phone uniqueness is **company-scoped** (`UQ_employees_company_phone_number`).

## Frontend company selection

- Operational React Query hooks wait for `isReady` and include `companyId` in query keys.
- `scopedApiClient` / `scopedApiPath` prefix operational paths with `companies/:activeCompanyId/`.
- `scopedApiPath` throws `ACTIVE_COMPANY_REQUIRED` if no runtime company is set.
- Multi-company users (including platform superadmin) must select a company before operational pages load.
- `409 COMPANY_SELECTION_REQUIRED` clears the active company and shows the selector.

See [MULTI_COMPANY_HARDENING.md](./MULTI_COMPANY_HARDENING.md) for the Phase 1.2 audit and hardening checklist.
