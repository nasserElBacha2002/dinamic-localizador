# Operation and Service Domain Terminology Refactor Report

## 1. Executive Summary

Final review pass completed the Operation/Service domain rename across backend, frontend, bot/WhatsApp, schemas, scripts, and migrations. Active application code now uses canonical `operation` / `service` terminology. Migration 035 was rewritten to discover FK/index dependencies via SQL Server catalogs. Migration 036 no longer mutates historical `audit_logs`. Migration 037 drops hollow legacy views and completes `bot_sessions` column rename. An automated terminology guard (`npm run check:terminology`) passes on `backend/src` and `frontend/src`.

## 2. Canonical Domain Model

### Operation
Scheduled work assignment (`scheduled_operations`). Admin UI: **Operación**. WhatsApp employee-facing: **trabajo** / **jornada**.

### Service
Operational location (`operational_locations`). Admin UI: **Servicio**. WhatsApp: **Servicio** when referring to the location entity.

### Operation Assignment
Employee-to-operation link (`operation_assignments`).

### Attendance
Check-in/check-out records (`attendance_records`) tied to `operation_id`.

## 3. Migration 035 Hardening

### Reachable Schema States
Idempotent for fresh DBs through 034 and dev DBs where 021/035 partial states may use alternate constraint names.

### Dependency Discovery
Per-column dynamic loops over `sys.foreign_keys` + `sys.foreign_key_columns` and `sys.indexes` + `sys.index_columns` before `sp_rename`.

### Foreign Keys
Recreated with canonical names (`FK_scheduled_operations_service_id`, `FK_operation_assignments_operation_id`, etc.).

### Indexes
Dropped via catalog discovery; recreated with `operation`/`service` naming including notification idempotency indexes.

### Column Rename Validation
Targets: `scheduled_operations.service_id`, `operation_assignments.operation_id`, `attendance_records.operation_id`, `whatsapp_attendance_notifications.operation_id`, `bot_simulation_sessions.operation_id`/`service_id`, `bot_sessions.operation_id`.

## 4. Inventory to Operation Final Cleanup

### Active Symbols Removed
`Inventory`, `InventoryRecord`, `inventoryDefaults`, `handleInventorySelection`, `buildInventorySelectionPrompt`, `createInventorySelectionSession`, schema names `createInventorySchema`, etc.

### Methods Renamed
`findByOperationForEmployee`, `findCheckoutEligibleOperations`, `resetConfirmationsForOperationScheduleChange`, `handleOperationSelection`, `parseOperationSelection`, etc.

### Error Codes Renamed
`OPERATION_NOT_FOUND`, `OPERATION_NOT_EDITABLE`, `INVALID_OPERATION_STATUS_TRANSITION`, `OPERATION_START_IN_PAST`, `EMPLOYEE_HAS_ACTIVE_OR_SCHEDULED_OPERATIONS`.

### SQL Aliases Renamed
`operation_*`, `service_*` in repositories and `row-mappers.ts`.

### Product Copy Renamed
Spanish admin copy uses Operación; WhatsApp uses trabajo/jornada for scheduled work.

## 5. Store to Service Final Cleanup

### Active Symbols Removed
`Store`, `storeService`, `CurrentDbStore`, `loadCurrentStoresFromDatabase`, `storeLocation` API field.

### Methods Renamed
`loadCurrentServicesFromDatabase`, `detectServicesSchema`, `reconcileServices`, `serviceNumber` types.

### Error Codes Renamed
`SERVICE_NOT_FOUND`, `SERVICE_INACTIVE`, `SERVICE_NAME_ALREADY_EXISTS`.

### SQL Aliases Renamed
`service_id`, `service_name`, `service_latitude`, etc.

### Product Copy Renamed
"Servicio no encontrado", "Servicio:" in bot confirmation messages.

## 6. Backend Active-Code Audit

`npm run check:terminology` → **PASS** (0 violations outside explicit allowlist).

## 7. Frontend Active-Code Audit

`npm run check:terminology` → **PASS**. Canonical routes `/operations`, `/services`. Legacy browser redirects preserved in `AppRoutes.tsx`.

## 8. Bot and WhatsApp Audit

### Internal Domain
`operationId`, `operationOptions`, `serviceId`, `serviceLatitude`, `serviceAllowedRadiusMeters`.

### Employee-Facing Operation Terminology
trabajo/jornada; no inventario in active bot copy.

### Service Terminology
"Servicio: {name}" in location context.

### Legacy Session Compatibility
Centralized in `legacy-operation-session-context.ts` (`inventoryId`/`inventoryOptions` read-only).

## 9. API Contract Audit

### Operations
`/operations`, `operationId`, `createOperationSchema`, `operationImportPreviewSchema`.

### Services
`/services`, `serviceId`, `serviceLocation` in bot simulator presets.

### Attendance
`operationId` in schemas and CSV export headers.

### Statistics
`/statistics/by-operation`, `/statistics/by-service`.

### Lookups
`/lookups/operations`, `/lookups/services`.

## 10. Database Active Schema Audit

Pending operator validation on target SQL Server after `npm run migrate`. Migrations 035–037 are idempotent. Legacy physical tables renamed in 021; 037 drops compatibility views.

### Tables
Canonical: `scheduled_operations`, `operational_locations`, `operation_assignments`.

### Columns
Canonical FK columns per migration 035.

### Foreign Keys
Catalog-discovered drops + canonical recreation.

### Indexes
Canonical operation/service names.

### Constraints
`CK_bot_sessions_state` updated in 037 for `WAITING_OPERATION_SELECTION`.

### Compatibility Views
Dropped in 037 (`stores`, `inventories`, `inventory_employees`).

## 11. Legacy Database View Policy

No demonstrated external SQL consumer. Hollow views removed in 037 (no column-alias compatibility).

## 12. Audit History Policy

Migration 036 no longer updates `audit_logs.entity_type`. UI should map `inventory`→Operación, `store`→Servicio at display time.

## 13. Permissions and Modules

Canonical keys: `operations`, `services`, `operations:read`, `operations:manage`, `services:read`, `services:manage`. Module key `inventory_operations` → `operations` in 037.

## 14. Browser Route Compatibility

`/inventories/*` → `/operations/*`, `/stores/*` → `/services/*` via `<Navigate replace />`.

## 15. Files and Directories Renamed

- `export-database-stores.ts` → `export-database-services.ts`
- `service-fix/db-stores.ts` → `db-services.ts`
- `service-reconciliation/store-number.ts` → `service-number.ts`
- Frontend canonical: `pages/operations`, `pages/services`, `components/operations`, `components/services`

## 16. Automated Terminology Guard

### Scanned Paths
`backend/src`, `frontend/src` (`.ts`, `.tsx`)

### Forbidden Tokens
inventory, inventories, inventario, inventarios, store, stores, tienda, tiendas (word boundaries)

### Explicit Allowlist
- `legacy-operation-session-context.ts`
- `operation-import.ts` (spreadsheet header aliases)
- `AppRoutes.tsx` (redirect paths)
- `terminology.ts` / `terminology.test.ts`
- Negative assertion tests
- `storeFormat` DB field references
- Mantine `store={combobox}` prop

### Result
**PASS**

## 17. Remaining Legacy References

| File | Context | Token | Classification | Why | Removal plan |
|------|---------|-------|----------------|-----|--------------|
| `database/migrations/001–034` | Historical DDL | inventory/store | HISTORICAL_IMMUTABLE_MIGRATION | Immutable migration history | Never rewrite |
| `database/migrations/035.sql` | DROP VIEW | inventories/stores | HISTORICAL_IMMUTABLE_MIGRATION | Drops legacy views before rename | N/A |
| `database/migrations/036.sql` | Comment | inventory/store | HISTORICAL_IMMUTABLE_MIGRATION | Documents audit display policy | N/A |
| `database/migrations/037.sql` | DROP VIEW | inventories/stores | HISTORICAL_IMMUTABLE_MIGRATION | Final view removal | N/A |
| `legacy-operation-session-context.ts` | Read compat | inventoryId | EXPLICIT_BOT_SESSION_READ_COMPATIBILITY | Active session TTL | Remove after TTL window |
| `operation-import.ts` | CSV headers | tienda | EXTERNAL_IMPORT_ALIAS | Legacy spreadsheet format | Keep for import compat |
| `AppRoutes.tsx` | Redirects | /inventories | EXPLICIT_API_COMPATIBILITY_ADAPTER | Browser bookmarks | Keep indefinitely |
| `terminology.ts` | legacySingular | Tienda | EXPLICIT_API_COMPATIBILITY_ADAPTER | Display map for old audit rows | Keep |
| `types/service.ts` | API field | storeFormat | THIRD_PARTY_CONTRACT | Physical DB column `store_format` | Rename column in future migration |
| `docs/attendance-confirmation-*.md` | Historical report | inventory | HISTORICAL_DOCUMENTATION | Prior implementation report | Archive only |

## 18. Validation Results

| Command | Result |
|---------|--------|
| `cd backend && npm run build` | PASS |
| `cd backend && npm test` | PASS (471/471) |
| `cd backend && npm run check:terminology` | PASS |
| `cd frontend && npm run build` | PASS |
| `cd frontend && npm test` | PASS (205/205) |
| `cd backend && npm run migrate` | SKIPPED (not run in this session) |
| `RUN_DB_INTEGRATION_TESTS=true npm test` | SKIPPED (env not configured in agent session) |

## 19. Regression Results

Unit/integration logic covered by passing test suites. Full manual regression checklist (create operation/service, WhatsApp flows, statistics, redirects) requires staging validation after migrate.

## 20. Known Limitations

- `store_format` physical column name retained in DB and API (`storeFormat`).
- Carrefour reconciliation CSV uses `store_number` column header (external format).
- DB constraint `UX_attendance_records_inventory_employee_active` retains historical name.
- Migration apply + metadata assertions must be run on staging/production SQL Server before deploy.

## 21. Final Status

**READY FOR CODE REVIEW**

---

## WhatsApp Canonical Service Reference

### Business Rule

Every Service displayed in WhatsApp uses `Name - Address - Locality` with safe omission of missing values and deduplication of equivalent parts.

### Canonical Formatter

- **File:** `backend/src/utils/format-service-reference.ts`
- **Functions:** `formatServiceReference`, `formatServiceReferenceFromFields`, `buildReminderServiceReference` (template layer)
- **Missing-value behavior:** Trims whitespace; omits null/blank address and locality
- **Duplicate-value behavior:** Skips address when equal to name; skips locality when already present in assembled parts (case-insensitive `es-AR`)
- **Locality field:** `operational_locations.locality` (not `neighborhood`)

### Bot Flows Updated

- Attendance confirmation positive/negative replies
- Assignment confirmation / unavailability selection and messages
- Arrival / check-in location request and registration messages
- Checkout location request, selection, and registration messages
- Operation selection prompts (multi-line readable format)
- Employee workday today/upcoming blocks

### Twilio Templates Updated

All proactive templates use canonical `{{2}}` service reference via `buildAttendanceReminderTemplateVariables`:

- `ARRIVAL_REMINDER_15_MIN`
- `EXIT_REMINDER_15_MIN`
- `NO_CHECKIN_AT_START`
- `ATTENDANCE_CONFIRMATION_REMINDER`

### Query / Type Changes

- `EmployeeAssignedOperation`, `CompatibleOperation`, `AttendanceReminderCandidate`, `OperationSelectionOption` → `serviceAddress`, `serviceLocality`
- SQL aliases: `service_address`, `service_locality` in assignment, operation, attendance, and notification repositories

### Tests

- `format-service-reference.test.ts` — formatter edge cases
- `attendance-reminder-template.test.ts` — all template types + fallback
- `employee-assignment-row-mapper.test.ts` — SQL mapping
- `bot-response.builder.test.ts`, `employee-assignment-format.test.ts` — message output

### Remaining Limitations

- `neighborhood` is not shown in WhatsApp service reference (locality only per business rule)
- Geofence continues to use coordinates, not formatted address text
