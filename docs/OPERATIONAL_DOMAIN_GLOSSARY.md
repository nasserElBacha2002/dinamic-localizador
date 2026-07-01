# Operational domain glossary

This document maps **current technical names** (stable in DB/API) to **conceptual backend aliases** and **Spanish product labels** introduced in Phase 2.

## Terminology mapping

| Current technical name | DB/API stable? | Conceptual backend alias | Spanish UI label | Notes |
|------------------------|----------------|--------------------------|------------------|-------|
| `Store` / `stores` | Yes | `OperationalLocation` | Ubicación | Physical/geofenced work site |
| `Inventory` / `inventories` | Yes | `ScheduledOperation` | Operación | Planned work event with schedule and tolerances |
| `Employee` / `employees` | Yes | `Worker` | Colaborador | Person who can be assigned and check in |
| `InventoryEmployeeAssignment` / `inventory_employees` | Yes | `OperationAssignment` | Colaborador asignado | Junction: worker assigned to operation |
| `AttendanceRecord` / `attendance_records` | Yes | `OperationAttendanceRecord` | Asistencia | Check-in/check-out with geolocation evidence |

## Stable contracts (do not rename without a dedicated phase)

- **Database tables and columns** — e.g. `stores`, `inventories`, `store_id`, `inventory_id`, `employee_id`
- **REST paths** — `/stores`, `/inventories`, `/employees`, `/attendance`
- **JSON fields** — `storeId`, `inventoryId`, `employeeId`, `storeName`, etc.
- **Permission keys** — `stores:read`, `inventories:manage`, `employees:read`, etc.
- **Module keys** — `inventory_operations`, `attendance`, `absences`, etc.

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| 2.1 | Audit and migration plan | Complete — `docs/PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md` |
| 2.2 | Frontend terminology layer | Complete — `frontend/src/domain/terminology.ts` |
| 2.3 | Backend type aliases | Complete — `backend/src/types/operational-domain.ts` |
| 2.4 | Import/export column aliases | Deferred |
| 2.5 | Optional API route aliases (`/locations`, `/operations`) | Deferred |
| 2.6+ | Optional DB rename | Deferred |

## Unchanged in Phase 2.3

- WhatsApp bot copy and intent parsing
- CSV/XLSX import/export column formats
- Runtime validation, geofencing, and attendance logic
- Repository, service, and route file names

## Usage guidance

- New backend modules **may** import conceptual aliases for documentation clarity.
- Existing code should **not** be mass-renamed; technical types remain the source of truth for serialization and SQL.
- Frontend labels use `frontend/src/domain/terminology.ts`; backend aliases are type-only equivalents.

## Related docs

- [PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md](./PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md)
- [PERMISSIONS.md](./PERMISSIONS.md)
- [COMPANY_MODULES.md](./COMPANY_MODULES.md)
