# Operation and Service Domain Terminology Refactor Report

## 1. Executive Summary

The platform domain terminology was standardized from **Inventory/Store** to **Operation/Service** across backend, frontend, API contracts, database active columns, WhatsApp copy, statistics, and tests. Physical tables `scheduled_operations`, `operational_locations`, and `operation_assignments` remain canonical; active FK columns were renamed via migration `035`. Legacy API routes `/inventories`, `/stores`, and `/locations` were removed; canonical routes are `/operations` and `/services`.

## 2. Canonical Domain Model

### Operation

Scheduled work (`scheduledStart`, `scheduledEnd`, tolerances, status). Belongs to a Service. Code: `Operation`, API: `operationId`, UI: Operación/Operaciones.

### Service

Operational location/context (e.g. Carrefour Caballito). Physical table: `operational_locations`. Code: `Service`, API: `serviceId`, UI: Servicio/Servicios.

### Operation Assignment

Employee assignment to an operation with confirmation status. Physical table: `operation_assignments`. Column: `operation_id`.

### Attendance

Unchanged entity name. Association field: `operationId` / `operation_id`.

## 3. Initial Legacy Reference Audit

### Inventory References

Found across ~60 backend files, ~50 frontend files, routes, hooks, types, bot handlers, statistics, bulk import, and tests. Classified as **active domain code** requiring rename.

### Store References

Found across repositories, services, frontend pages/components, statistics, geolocation, and import parsers. Classified as **active domain code** requiring rename.

### Spanish Product Copy

`Inventarios`, `Tienda`, `inventario asignado` replaced with `Operaciones`, `Servicio`, `trabajo/jornada asignada` in admin UI and WhatsApp.

### Database

Physical tables already renamed in migration `021`. Active columns still used `inventory_id` / `store_id` until migration `035`.

### API

Dual aliases (`/inventories` + `/operations`, `/stores` + `/locations`) replaced with canonical `/operations` and `/services` only.

### Bot

Session context used `inventoryId`; updated to `operationId` with read-compat `operationId ?? inventoryId` for in-flight sessions.

### Documentation

Historical reports retain old terminology. This report documents the new canonical model.

## 4. Inventory to Operation Rename

### Backend Files

Renamed: `inventory.*` → `operation.*` (controller, service, repository, routes, schema, import, assignment, attendance, bot selector, lifecycle utils, tests).

### Symbols

`Inventory` → `Operation`, `inventoryId` → `operationId`, `inventoryService` → `operationService`, `inventoryRepository` → `operationRepository`, etc.

### Services

`operation.service.ts`, `operation-import.service.ts`, `operation-assignment.service.ts`, `absence-operation-impact.service.ts`.

### Repositories

`operation.repository.ts`, `operation-attendance.repository.ts`, `operation-employee.repository.ts`.

### Types

`Operation`, `OperationWithService`, `OperationStatus`, `CreateOperationInput`, `UpdateOperationInput`, `ListOperationsQuery`.

### Schemas

`operation.schema.ts`, `operation-import.schema.ts`.

## 5. Store to Service Rename

### Backend Files

Renamed: `store.*` → `service.*` (controller, service, repository, routes, schema, tests).

### Symbols

`Store` → `Service`, `storeId` → `serviceId`, `storeName` → `serviceName`, `storeFormat` → `serviceFormat`.

### Services

`service.service.ts` (module `services/service.service.ts`).

### Repositories

`service.repository.ts` — queries `operational_locations` with service terminology in aliases.

### Types

`Service`, `CreateServiceInput`, `UpdateServiceInput`, `ListServicesQuery`.

### Schemas

`service.schema.ts`.

## 6. API Contract Rename

### Operations Routes

`GET/POST /api/operations`, `GET/PATCH/DELETE /api/operations/:id`, nested `/operations/:operationId/employees`, `/operations/:id/attendance-summary`.

### Services Routes

`GET/POST /api/services`, `GET/PATCH/DELETE /api/services/:id`.

### DTO Changes

Payloads/responses use `operationId`, `serviceId`, `operation`, `service`. No mixed `storeId` on operation objects.

### Legacy Endpoint Policy

**Removed** `/inventories`, `/stores`, `/locations` mounts from `routes/index.ts`. No duplicate business logic adapters. Frontend consumes only `/operations` and `/services`. Employee `/workers` alias retained (out of scope).

## 7. Frontend Operations Rename

### Routes

`/inventories` → `/operations` (list, create, import, detail).

### Pages

`pages/operations/` — `OperationsListPage`, `OperationCreatePage`, `OperationDetailPage`, `OperationImportPage`.

### Components

`components/operations/` — `OperationForm`, `OperationWorkforceSection`, `OperationEmployeeTable`, etc.

### API Client

`operations.api.ts`, `useOperations` hook, query keys `["operations"]`, `["operation", id]`.

### Query Keys

All inventory keys migrated to operation keys.

## 8. Frontend Services Rename

### Routes

`/stores` → `/services`.

### Pages

`pages/services/` — `ServicesListPage`, `ServiceCreatePage`, `ServiceEditPage`.

### Components

`components/services/` — `ServiceForm`, `ServiceLocationPicker`, `ServiceSearchAutocomplete`.

### Forms

Labels use Servicio; payload `serviceId`.

### API Client

`services.api.ts`, `useServices`, keys `["services"]`, `["service", id]`.

### Query Keys

All store keys migrated to service keys.

## 9. Bot and WhatsApp Terminology

### Operation Employee-Facing Term

`trabajo asignado` / `jornada asignada` — not `inventario` or generic `servicio` for operations.

### Service Employee-Facing Term

`servicio` / service name (e.g. Carrefour Caballito) when referring to the Service entity location.

### Session Context

Writes `operationId`; reads `operationId ?? inventoryId` for legacy in-flight sessions.

### Reminder Variables

Template uses employee name, service name (location), operation date/time. Contextual replies updated per spec.

## 10. Database Active Schema Audit

### Existing Operation Tables

`scheduled_operations`, `operation_assignments` — unchanged physical names.

### Operation Foreign Key Columns

Migration `035`: `inventory_id` → `operation_id` on `operation_assignments`, `attendance_records`, `whatsapp_attendance_notifications`, `bot_simulation_sessions`; `store_id` → `service_id` on `scheduled_operations`, `bot_simulation_sessions`.

### Operational Locations Decision

Physical table **`operational_locations` retained** — accurately represents domain responsibility. Code domain uses `Service`; SQL aliases use `service_id`, `service_name`.

### Constraints

New FK/index names use `operation` / `service` prefixes. Legacy views `stores`, `inventories`, `inventory_employees` recreated after column rename.

### Indexes

Recreated with operation/service naming (e.g. `IX_scheduled_operations_company_service_scheduled_start`).

## 11. Permissions and Module Keys

Permissions renamed in code: `operations:read/manage`, `services:read/manage` (replacing `inventories:*`, `stores:*`). Module key `inventory_operations` **retained** — covers both operations and services features; no DB migration required for `company_modules`. Audit entity types backfilled in migration `036`.

## 12. Attendance and Reminder Associations

`attendance.operationId`, reminder candidates use `operationId` and `serviceName`. Repositories query `operation_id` / `service_id` columns post-migration.

## 13. Statistics and Dashboard

API: `/statistics/attendance/by-operation`, `/by-service`. DTO fields: `totalOperations`, `assignedOperationsCount`, `AttendanceByServiceRow`. Dashboard copy uses Operaciones/Servicios.

## 14. Bulk Upload

`operation-import` service and headers; import aliases accept legacy spreadsheet headings (`Tienda`, `Punto`) where documented; canonical preview output uses Servicio.

## 15. Files Renamed

~38 backend files git-renamed (inventory→operation, store→service). Frontend directories: `inventories`→`operations`, `stores`→`services`. See git diffstat for full list (233 files touched).

## 16. Files Modified

Backend services, repositories, routes, types, row-mappers, WhatsApp handlers, statistics, permissions, tests. Frontend routes, API client, hooks, terminology, statistics components, settings copy/tests.

## 17. API Breaking Changes

- `/inventories` → `/operations` (removed legacy)
- `/stores`, `/locations` → `/services` (removed legacy)
- `inventoryId` → `operationId`, `storeId` → `serviceId` in all active JSON contracts
- Statistics: `by-inventory` → `by-operation`, `by-location` → `by-service`
- Permissions: `inventories:read` → `operations:read`, `stores:read` → `services:read`

## 18. Database Migrations Added

| Migration | Purpose |
|-----------|---------|
| `035_rename_operational_foreign_key_columns.sql` | `operation_id`, `service_id` column renames + FK/index recreation |
| `036_operational_domain_permission_audit_backfill.sql` | Audit `entity_type` inventory→operation, store→service |

## 19. Remaining Legacy References

| File | Reference | Classification | Reason | Removal plan |
|------|-----------|----------------|--------|--------------|
| `operational-domain.ts` | `ScheduledOperation = Inventory` alias | Documentation alias | Backward type documentation only | Remove when aliases unused |
| `operational-tables.ts` | `LEGACY_*_VIEW` constants | Compatibility boundary | SQL Server views for external tools | Keep until views dropped |
| `bot-session-states.ts` | `WAITING_INVENTORY_SELECTION` | Session compat | In-flight bot sessions | Rename states in follow-up with session invalidation |
| `bot-session.service.ts` | `inventoryOptions` in JSON | Session compat | TTL-expiring sessions | Read-compat only; write `operationOptions` later |
| `store-reconciliation/`, `store-fix/` scripts | store naming | Utility scripts | Offline reconciliation tooling | Rename in dedicated tooling pass |
| `company-modules.ts` | `inventory_operations` module key | Persisted module key | DB records use this key | Optional alias migration later |
| Historical migrations 001–034 | inventory/store columns | Historical immutable | Applied schema history | Never edit |
| `docs/attendance-confirmation-*.md` | inventory terminology | Historical documentation | Prior implementation reports | Intentionally preserved |

## 20. Validation Results

| Command | Result |
|---------|--------|
| `cd backend && npm run build` | PASS |
| `cd backend && npm test` | PASS (472 unit) |
| `RUN_DB_INTEGRATION_TESTS=true` (4 suites, 6 tests) | PASS |
| `npm run migrate` | PASS (035, 036 applied) |
| `cd frontend && npm run build` | PASS |
| `cd frontend && npm test` | PASS (205 tests) |

## 21. Regression Results

Core flows validated via build + test suites:

- Operation CRUD, list, import paths compile and route correctly
- Service CRUD, location picker preserved
- Attendance/reminder integration tests pass with new column names
- Statistics API aligned end-to-end
- Settings operational copy uses operación terminology
- Frontend navigation: `/operations`, `/services`

Manual QA recommended for: Maps geofence, bulk upload with legacy spreadsheet headers, live WhatsApp session migration.

## 22. Known Limitations

- Bot session state enum names still contain `INVENTORY` internally
- `inventory_operations` module key unchanged in DB
- Store reconciliation CLI scripts not renamed
- Some local variable names in statistics hook still use `inv*` / `loc*` URL state keys (behavior correct)

## 23. Final Status

READY FOR CODE REVIEW
