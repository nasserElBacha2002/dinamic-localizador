# Operation and Service Domain Terminology Refactor Report

## 1. Executive Summary

This pass closes review blockers for the Operation/Service domain rename: identifier-aware terminology guard with tests, deterministic `company_modules` merge (migration 038), removal of legacy `*:stores` npm scripts, `storeFormat` → `serviceFormat` domain rename, forward-only migration integrity preserved, extended DB integration assertions, and WhatsApp canonical Service reference regression coverage.

**Final Status: BLOCKED** — DB integration tests could not be executed against a live SQL Server in this environment (106 suites cancelled without full `DB_*` credentials). Unit/build/terminology validation passes.

## 2. Terminology Guard Correction

### Previous Regex Blind Spot
The prior guard used `\b(inventory|store|...)\b`, missing legacy terms embedded in identifiers (`inventoryId`, `storeFormat`, `INVENTORY_NOT_FOUND`, `seed:stores`).

### Identifier Detection
New scanner (`backend/src/scripts/domain-terminology-scanner.ts`) splits camelCase/PascalCase/snake_case/SCREAMING_SNAKE segments and detects:
- Inventory family: exact segment or prefix (`inventory`, `inventories`, `inventario`, `inventarios`)
- Store family: exact segment match (`store`, `stores`, `tienda`, `tiendas`) — avoids `restore`, `localStorage`, `services`

### Path Detection
Path components are scanned (`store-fix` → `PATH_NAME` violation).

### Configuration Detection
`backend/package.json` and `frontend/package.json` scripts are parsed; legacy script names like `seed:stores` fail under `CONFIGURATION`.

### Allowlist Policy
Exact per-file regex allowlists only:
- `EXPLICIT_BOT_SESSION_READ_COMPATIBILITY`: `legacy-operation-session-context.ts`, `twilio.types.ts` (`inventoryId`, `inventoryOptions`)
- `EXTERNAL_IMPORT_ALIAS`: `operation-import.ts` (`tienda` spreadsheet headers)
- `PHYSICAL_DATABASE_COMPATIBILITY`: `store_format` in repository SQL, row mapper, export CSV header, `company-location-types.ts`
- `THIRD_PARTY_CONTRACT`: Node `AsyncLocalStorage.getStore()` in bot runtime files
- Mantine `store={...}` in `FilterLookupInput.tsx`

No directory-level bypasses.

### Scanner Tests
`backend/src/scripts/domain-terminology-scanner.test.ts` proves violations for `InventoryRecord`, `inventoryId`, `storeFormat`, `STORE_INACTIVE`, Spanish copy, `seed:stores`, and path `store-fix`.

### Final Result
`npm run check:terminology` → **PASS**

## 3. Company Module Migration Correction

### Legacy Key Merge Rule
Migration `038_finalize_company_module_key_migration.sql` (forward-only, idempotent):
1. When both `inventory_operations` and `operations` exist: merge `is_enabled` with OR semantics; preserve earliest `created_at`, latest `updated_at`
2. Delete `inventory_operations` when canonical row exists
3. Rename orphaned `inventory_operations` → `operations`

### Duplicate Canonical/Legacy Case
Company C scenario (legacy enabled + canonical disabled) → single `operations` row with `is_enabled = 1`.

### Enabled-State Merge Semantics
`final operations enabled = canonical.enabled OR legacy.inventory_operations.enabled`

### DB Integration Test
`backend/src/database/company-module-migration.integration.test.ts` — asserts global zero legacy rows and exercises A/B/C merge fixture.

### Final Legacy Row Count
Expected after 038: `SELECT COUNT(*) FROM company_modules WHERE module_key = N'inventory_operations'` → **0**

## 4. Legacy npm Command Removal

### Commands Removed
From `backend/package.json`:
- `seed:stores`
- `reconcile:stores`
- `export:stores`
- `fix:stores`

Canonical scripts retained: `seed:services`, `reconcile:services`, `export:services`, `fix:services`.

Help text updated in `export-database-services.ts`, `fix-services-from-reconciliation.ts`, `reconcile-services.ts`.

### External Compatibility Audit
**No external consumer found** for `*:stores` scripts. References exist only in `.cursor/commands/deploy-dinamic-server.md` (internal Cursor command doc, not production cron/CI).

## 5. storeFormat Contract Audit

### External Consumer Evidence
**No external consumer found** for JSON/API field `storeFormat` in Postman collections, deployment scripts, or monorepo API clients.

### Final Decision
Rename active domain field to `serviceFormat`. Physical column `store_format` retained at DB boundary.

### Domain/API Rename
Renamed across backend types/schemas/services, frontend types/schemas/forms, and tests. Repository maps `serviceFormat: row.store_format`.

### Physical DB Compatibility Boundary
`store_format` appears only in:
- `service.repository.ts` SQL
- `row-mappers.ts` mapper input
- `export-database-services.ts` CSV header
- Historical migrations

## 6. Forward-Only Migration Integrity

### Migration 035 History
`035_rename_operational_foreign_key_columns.sql` — catalog-based FK/index discovery. Not modified in this pass.

### Migration 036 History
`036_operational_domain_permission_audit_backfill.sql` — current file is comments only (no `audit_logs` mutation). If an earlier 036 revision ran on a persistent DB, historical audit normalization may already have occurred there; this migration file no longer performs updates.

### Persistent Environments Audited
No deployment logs or migration history table snapshots in-repo proving 035/036 apply state on production. Git history shows file edits on branch only (`928fe11`, `6cc863d`). Treat as **disposable/local unless ops confirms otherwise**.

### Applied Content Restored
035/036 not rewritten in this pass.

### New Corrective Migrations Added
- `038_finalize_company_module_key_migration.sql` — company module key merge (does not edit 037)

## 7. Domain Completion DB Validation

### Canonical Columns
Integration assertions in `operational-table-rename.integration.test.ts`:
- `scheduled_operations.service_id`
- `operation_assignments.operation_id`
- `attendance_records.operation_id`
- `whatsapp_attendance_notifications.operation_id`
- `bot_simulation_sessions.operation_id`, `service_id`
- `bot_sessions.operation_id` (no `inventory_id`)

### Bot Session States
Assert zero `WAITING_INVENTORY_SELECTION` / `WAITING_CHECKOUT_INVENTORY_SELECTION`.

### Company Module Keys
Assert zero `inventory_operations` rows.

### Legacy Views
Assert `stores`, `inventories`, `inventory_employees` views do not exist.

### Constraints and Indexes
Validated via migration 035 catalog recreation (structural smoke in `operational-tables.test.ts`).

## 8. WhatsApp Canonical Service Reference

### Shared Formatter
`formatServiceReference` / `formatServiceReferenceFromFields` unchanged.

### Reminder Templates
Twilio `{{2}}` uses canonical reference in `attendance-reminder-template.ts`.

### Bot Messages
Bot handlers use shared formatter via `employee-assignment-format.ts` and related builders.

### End-to-End Message Regression
`employee-workday.service.test.ts` asserts upcoming assignments message contains:
`Carrefour Caballito - Av. Rivadavia 5108 - Caballito`

## 9. Remaining Legacy References

| File | Context | Token | Classification | Reason |
|------|---------|-------|----------------|--------|
| `database/migrations/*.sql` | Historical DDL | inventory/store table names | HISTORICAL_IMMUTABLE_MIGRATION | Immutable migration chain |
| `backend/src/constants/operation-import.ts` | Spreadsheet aliases | tienda/Tienda | EXTERNAL_IMPORT_ALIAS | Client file headers |
| `backend/src/utils/legacy-operation-session-context.ts` | Session read compat | inventoryId | EXPLICIT_BOT_SESSION_READ_COMPATIBILITY | Persisted bot session JSON |
| `backend/src/types/twilio.types.ts` | Session payload types | inventoryId/inventoryOptions | EXPLICIT_BOT_SESSION_READ_COMPATIBILITY | Twilio/session compat |
| `backend/src/repositories/service.repository.ts` | SQL INSERT/UPDATE | store_format | PHYSICAL_DATABASE_COMPATIBILITY | DB column name |
| `backend/src/utils/row-mappers.ts` | Mapper | store_format | PHYSICAL_DATABASE_COMPATIBILITY | DB column name |
| `backend/src/utils/bot-runtime-context.ts` | AsyncLocalStorage | getStore() | THIRD_PARTY_CONTRACT | Node.js API |
| `frontend/src/design-system/filters/FilterLookupInput.tsx` | Mantine Combobox | store={ | THIRD_PARTY_CONTRACT | Mantine prop |
| `frontend/src/routes/AppRoutes.tsx` | Redirects | /inventories, /stores | HISTORICAL_DOCUMENTATION | Browser URL compat |
| `frontend/src/domain/terminology.ts` | Label map | legacy keys | HISTORICAL_DOCUMENTATION | UI label migration map |
| `README.md` | Product description | tienda/inventario | HISTORICAL_DOCUMENTATION | Pre-rename product doc (not active code) |
| `mock.restoreAll()`, `stored`, `restoreAllModules` | Test/mock API | store/inventory substring | N/A (grep false positive) | Not domain terminology |

## 10. Validation Results

| Command | Result |
|---------|--------|
| `npm run check:terminology` | PASS |
| `backend npm run lint` | PASS |
| `backend npm run build` | PASS |
| `backend npm test` | PASS (488 tests) |
| `frontend npm run lint` | PASS |
| `frontend npm test` | PASS (205 tests) |
| `frontend npm run build` | PASS |
| `npm run migrate` | SKIPPED (no DB in agent env) |
| `npm run migrate:status` | SKIPPED |

## 11. DB Integration Results

| Suite | Result |
|-------|--------|
| `operational-table-rename.integration.test.ts` | SKIPPED |
| `company-module-migration.integration.test.ts` | SKIPPED |
| Other `*.integration.test.ts` | SKIPPED (106 cancelled without full DB env) |

## 12. Known Limitations

- DB integration validation requires `RUN_DB_INTEGRATION_TESTS=true` plus live SQL Server credentials.
- README and `.cursor/commands/deploy-dinamic-server.md` still describe legacy product vocabulary; not scanned by active-code guard.
- Scanner segment split does not flag single-token aliases like `OperationalLocationIsStore` without camel boundaries (renamed in tests where found).

## 13. Final Status

**BLOCKED** — All code-level acceptance gates pass; DB integration and migrate validation pending live database execution.
