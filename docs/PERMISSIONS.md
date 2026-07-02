# Permissions and contextual access (Phase 1.6)

## Purpose

Company users have a **role** per company membership. Roles resolve to a fixed permission set at runtime (`resolvePermissionsForRole`). Permissions decide what a user can do; **company modules** decide what product areas the company has enabled. Both must pass for operational features.

## Role matrix

| Role | Typical permissions |
|------|---------------------|
| OWNER | All permissions including `users:manage` and `bot_simulator:use` |
| ADMIN | All except `users:manage` |
| HR | Employees, attendance read, absences, reports read |
| SUPERVISOR | Employees/stores/inventories read, attendance review, reports read, `bot_simulator:use` |
| OPERATOR | `company:read`, `inventories:read`, `attendance:read` only |
| READ_ONLY | All `*:read` permissions (no manage/review/export) |

Source: `backend/src/constants/company-permissions.ts`

## OPERATOR expected behavior

With all modules enabled, OPERATOR should see:

- Inicio
- Inventarios
- Asistencias

OPERATOR must **not** see or access: Empleados, Tiendas, Ausencias, Estadísticas, Simulador de Bot, Configuración de empresa, Usuarios de empresa.

OPERATOR may use **lookup** endpoints for filter data on allowed pages without receiving `employees:read` or `stores:read`.

## Permissions vs modules

| Layer | Question answered |
|-------|-------------------|
| Module | Does this company have the product area enabled? |
| Permission | Can this user perform the action? |

Frontend navigation and `FeatureRouteGuard` require **both**.

Backend operational routes apply:

1. `resolveCompanyContext`
2. `loadCompanyModuleStates` (module-gated routers)
3. `requireCompanyModule` / `requireAnyCompanyModule` (route mount)
4. `requirePermission` / `requireAnyPermission` (feature router)

## Contextual lookup endpoints

Minimal read-only DTOs for filters and labels on pages where the user lacks full resource read permission.

```
GET /api/companies/:companyId/lookups/employees
GET /api/companies/:companyId/lookups/stores
GET /api/companies/:companyId/lookups/inventories
```

### Employee lookup

Fields: `id`, `fullName` (no phone number).

Allowed if user has any of: `employees:read`, `attendance:read`, `inventories:read`, `absences:read`.

Module: attendance, inventory_operations, or absences enabled.

### Store lookup

Fields: `id`, `name`, `address`.

Allowed if user has any of: `stores:read`, `inventories:read`, `attendance:read`.

Module: attendance or inventory_operations enabled.

### Inventory lookup

Fields: `id`, `name`, `startDate`, `endDate`, `storeName`.

Allowed if user has: `inventories:read` or `attendance:read`.

Module: attendance or inventory_operations enabled.

Lookups are **not** substitutes for full CRUD APIs.

## Bot simulator permission

`bot_simulator:use` is required for all bot simulator routes. OPERATOR does not receive this permission. Previously `attendance:read` incorrectly granted simulator access; that is removed.

Granted to: OWNER, ADMIN, SUPERVISOR.

## Company settings read policy

`GET /settings` and `GET /modules` require `company:read` (OPERATOR has this). **PATCH** requires `company:settings:update`.

Frontend hides `/settings/company` from OPERATOR (`company:settings:update` required). API read access may still exist for `company:read` users until a future policy change.

## Related docs

- [COMPANY_MODULES.md](./COMPANY_MODULES.md)
- [MULTI_COMPANY_HARDENING.md](./MULTI_COMPANY_HARDENING.md)
