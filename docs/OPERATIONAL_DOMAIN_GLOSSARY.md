# Operational domain glossary

This document maps **current technical names** (stable in DB/API) to **conceptual backend aliases** and **Spanish product labels** introduced in Phase 2.

## Terminology mapping

| Current technical name | DB physical (2.7) | Legacy view | Conceptual alias | Spanish UI label |
|------------------------|-------------------|-------------|------------------|------------------|
| `Store` / `stores` | `operational_locations` | `stores` | `OperationalLocation` | Ubicación |
| `Inventory` / `inventories` | `scheduled_operations` | `inventories` | `ScheduledOperation` | Operación |
| `Employee` / `employees` | `employees` (unchanged) | — | `Worker` | Colaborador |
| `InventoryEmployeeAssignment` | `operation_assignments` | `inventory_employees` | `OperationAssignment` | Colaborador asignado |
| `AttendanceRecord` / `attendance_records` | `attendance_records` (unchanged) | — | `OperationAttendanceRecord` | Asistencia |

## Stable contracts (do not rename without a dedicated phase)

- **Database tables and columns** — physical: `operational_locations`, `scheduled_operations`, `operation_assignments`; legacy views: `stores`, `inventories`, `inventory_employees`; columns `store_id`, `inventory_id`, `employee_id` unchanged
- **REST paths** — `/stores`, `/inventories`, `/employees`, `/attendance` (canonical); optional aliases `/locations`, `/operations`, `/workers` — see [API_ROUTE_ALIASES.md](./API_ROUTE_ALIASES.md)
- **JSON fields** — `storeId`, `inventoryId`, `employeeId`, `storeName`, etc.
- **Permission keys** — `stores:read`, `inventories:manage`, `employees:read`, etc.
- **Module keys** — `inventory_operations`, `attendance`, `absences`, etc.

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| 2.1 | Audit and migration plan | Complete — `docs/PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md` |
| 2.2 | Frontend terminology layer | Complete — `frontend/src/domain/terminology.ts` |
| 2.3 | Backend type aliases | Complete — `backend/src/types/operational-domain.ts` |
| 2.4 | Bulk import column aliases | Complete — `backend/src/utils/inventory-import-headers.ts` |
| 2.5 | Optional API route aliases | Complete — `docs/API_ROUTE_ALIASES.md` |
| 2.6 | Optional DB rename plan | Complete (plan only) — `docs/DB_RENAME_PLAN_PHASE_2_6.md` |
| 2.7 | Physical DB rename (selected tables) | Complete — `docs/DB_RENAME_IMPLEMENTATION_PHASE_2_7.md` |

## Unchanged in Phase 2.3

- WhatsApp bot copy and intent parsing
- Runtime validation, geofencing, and attendance logic
- Repository, service, and route file names

## Bulk import column aliases (Phase 2.4)

Accepted **minimal** columns (location + date):

| Role | Accepted headers (examples) | Recommended template |
|------|----------------------------|----------------------|
| Location | `PUNTO`, `Sucursal`, `Ubicación` / `Ubicacion`, `tienda` | `Sucursal` |
| Date | `Fecha` | `Fecha` |

Legacy minimal format `PUNTO` + `Fecha` remains fully supported. Generic minimal format `Ubicación` + `Fecha` is also accepted.

Accepted **extended** columns:

| Role | Accepted headers (examples) |
|------|----------------------------|
| Location | `tienda`, `ubicacion`, `sucursal`, `punto` |
| Start | `fecha_inicio`, `Fecha de inicio` |
| End | `fecha_fin`, `Fecha de fin` |

Ignored columns (unchanged): `LOCAL`, `Formato`, `PROVEEDOR`.

Default schedule for date-only minimal import: start 20:30, end next day 03:00. Default tolerances: 60 / 90 minutes.

Attendance CSV export and statistics export headers remain legacy labels for backward compatibility.

## Usage guidance

- New backend modules **may** import conceptual aliases for documentation clarity.
- Existing code should **not** be mass-renamed; technical types remain the source of truth for serialization and SQL.
- Frontend labels use `frontend/src/domain/terminology.ts`; backend aliases are type-only equivalents.

## Related docs

- [PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md](./PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md)
- [API_ROUTE_ALIASES.md](./API_ROUTE_ALIASES.md)
- [DB_RENAME_PLAN_PHASE_2_6.md](./DB_RENAME_PLAN_PHASE_2_6.md)
- [DB_RENAME_IMPLEMENTATION_PHASE_2_7.md](./DB_RENAME_IMPLEMENTATION_PHASE_2_7.md)
- [PERMISSIONS.md](./PERMISSIONS.md)
- [COMPANY_MODULES.md](./COMPANY_MODULES.md)
