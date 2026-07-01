# Company modules (Phase 1.5)

## Purpose

`company_modules` controls which product areas are visible and accessible for each company. This is separate from user permissions:

- **Permissions** decide what a user can do within an enabled area.
- **Modules** decide whether the company has that area enabled at all.

## Module keys

| Key | UI label | Purpose |
|-----|----------|---------|
| `attendance` | Asistencias | Attendance records, check-in/check-out review |
| `inventory_operations` | Operaciones de inventario | Stores, inventories, assignments, import |
| `absences` | Ausencias | Absence types and requests |
| `reports` | Reportes | Statistics and reporting |
| `bot_simulator` | Simulador de Bot | Conversational bot testing |

Constants: `backend/src/constants/company-modules.ts`

## Defaults

New companies receive all five modules enabled (`DEFAULT_COMPANY_MODULE_KEYS`). Platform company creation seeds modules via `companyModuleRepository.bulkEnable`.

Older companies without rows get defaults created on first `GET /modules` via `ensureDefaults`.

## Core module rule

At least one of these must remain enabled:

- `attendance`
- `inventory_operations`
- `absences`

`reports` and `bot_simulator` can be disabled independently.

Backend error: `CORE_MODULES_REQUIRED`  
Frontend validation: "Debe quedar habilitado al menos un módulo operativo."

## API

```
GET   /api/companies/:companyId/modules
PATCH /api/companies/:companyId/modules
```

Permissions:

| Action | Permission |
|--------|------------|
| Read | `company:read` |
| Update | `company:settings:update` |

PATCH body:

```json
{
  "modules": [
    { "moduleKey": "attendance", "isEnabled": true },
    { "moduleKey": "absences", "isEnabled": false }
  ]
}
```

Disabled module access on operational routes returns:

```json
{
  "error": {
    "code": "MODULE_DISABLED",
    "message": "Este módulo no está habilitado para esta empresa."
  }
}
```

Platform superadmin still receives `MODULE_DISABLED` on product routes when a module is disabled (no bypass for normal product APIs).

## Backend route mapping

Module middleware runs at the operational router mount level before the feature router executes. Feature routers still keep their own permission middleware, so **modules and permissions both apply**.

Middleware order:

```
authenticate
→ resolveCompanyContext
→ [non-module routes, e.g. /users]
→ loadCompanyModuleStates
→ requireCompanyModule / requireAnyCompanyModule (path-specific mount)
→ feature router requirePermission(...)
→ controller
```

Routes mounted **before** `loadCompanyModuleStates` (not gated by `company_modules`):

- `/companies/:companyId/users`

Routes gated only by permissions on `companyRouter` (no module load):

- `/companies/:companyId/settings`
- `/companies/:companyId/modules`

Other non-module routes:

- `/platform/*`
- `/auth`, `/health`, `/webhooks/twilio`

### Self-healing module rows

`loadCompanyModuleStates` calls `companyModuleService.getModuleStates`, which currently ensures missing default rows via `ensureDefaults`. This is a temporary self-healing behavior for legacy companies. A future migration/backfill can make operational module loading read-only.

Explicit default creation also happens on:

- `GET /companies/:companyId/modules`
- Platform company creation

| Module | Routes |
|--------|--------|
| `attendance` | `/attendance`, `/dev/attendance-reminders` |
| `inventory_operations` | `/stores`, `/inventories`, `/inventories/:inventoryId/employees` |
| `absences` | `/absence-types`, `/absence-requests` |
| `reports` | `/statistics` |
| `bot_simulator` | `/bot-simulator` |
| Any of attendance / inventory_operations / absences | `/employees` |

Absence module guards are mounted on `/absence-types` and `/absence-requests` only (not as a pathless router middleware).

Not gated by modules:

- `/companies/:companyId/settings`
- `/companies/:companyId/modules`
- `/companies/:companyId/users`
- `/platform/*`
- `/auth`, `/health`, `/webhooks`

## Frontend navigation mapping

Navigation requires **both** an enabled module and the user's permission. See [PERMISSIONS.md](./PERMISSIONS.md).

| Nav item | Module requirement |
|----------|-------------------|
| Inicio | Always |
| Empleados | Any of attendance, inventory_operations, absences |
| Tiendas / Inventarios | inventory_operations |
| Asistencias | attendance |
| Ausencias | absences |
| Estadísticas | reports |
| Simulador de Bot | bot_simulator |
| Configuración de empresa / Usuarios | Permission only (`company:settings:update` / `users:manage`) |
| Empresas de plataforma | Platform admin only |

`ModuleRouteGuard` / `FeatureRouteGuard` blocks direct URL access. Backend enforcement remains authoritative.

Contextual **lookup** endpoints provide minimal filter data without granting full `employees:read` / `stores:read`. See [PERMISSIONS.md](./PERMISSIONS.md).

## Settings UI

`/settings/company` includes a separate **Módulos habilitados** section with its own **Guardar módulos** button. Users with `company:read` only see switches read-only.

## Deferred

- Billing / subscriptions per module
- Module marketplace
- WhatsApp employee portal module
- Migrating bot runtime config fully to `company_settings`
- Feature-level enforcement inside shared modules (e.g. employee absence balances when absences disabled)
