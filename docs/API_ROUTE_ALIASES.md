# API route aliases (Phase 2.5)

Optional generic REST path aliases for operational domain terminology. Aliases reuse the **same routers, controllers, services, repositories, permissions, and module gates** as the canonical routes.

## Route mapping

| Existing route | Alias route | Permission source | Module gate | Response shape |
|----------------|-------------|-------------------|-------------|----------------|
| `GET/POST/PUT/DELETE /api/companies/:companyId/stores` | `/api/companies/:companyId/locations` | `stores:*` | `inventory_operations` | unchanged |
| `GET/POST/PUT/DELETE /api/companies/:companyId/inventories` | `/api/companies/:companyId/operations` | `inventories:*` | `inventory_operations` | unchanged |
| `GET/POST/PUT/DELETE /api/companies/:companyId/employees` | `/api/companies/:companyId/workers` | `employees:*` | attendance / inventory_operations / absences | unchanged |
| `GET /api/companies/:companyId/lookups/stores` | `/api/companies/:companyId/lookups/locations` | same as stores lookup | same as stores lookup | unchanged |
| `GET /api/companies/:companyId/lookups/inventories` | `/api/companies/:companyId/lookups/operations` | same as inventories lookup | same as inventories lookup | unchanged |
| `GET /api/companies/:companyId/lookups/employees` | `/api/companies/:companyId/lookups/workers` | same as employees lookup | same as employees lookup | unchanged |

Legacy unscoped routes under `/api/stores`, `/api/inventories`, `/api/employees`, and `/api/lookups/*` also expose the same aliases (`/locations`, `/operations`, `/workers`).

## Supported methods per alias

Only methods that exist on the canonical router are available on the alias:

- **Locations** — `GET`, `POST`, `GET /:id`, `PUT /:id`, `DELETE /:id` (same as stores; no `PATCH`).
- **Operations** — `GET`, `POST`, `GET /:id`, `PUT /:id`, `DELETE /:id`, plus `/import/preview` and `/import/confirm` (same as inventories).
- **Workers** — `GET`, `POST`, `GET /:id`, `PUT /:id`, `DELETE /:id`, plus absence-balance sub-routes (same as employees).

## JSON response fields (unchanged)

Alias routes return the same JSON contracts as canonical routes, including:

- `storeId`, `storeName`, `stores`
- `inventoryId`, `inventory`, `inventories`, `assignedEmployees`
- `employeeId`, `employee`, `employees`, `employeeType`, `phoneNumber`

Do **not** expect renamed JSON fields when calling alias paths.

## Permissions and modules (unchanged)

- No new permission keys (`locations:read`, `operations:read`, `workers:read` were **not** added).
- No new module keys (`locations`, `operations`, `workers` were **not** added).
- `/locations` uses `stores:read` / `stores:manage`.
- `/operations` uses `inventories:read` / `inventories:manage`.
- `/workers` uses `employees:read` / `employees:manage`.

## Usage guidance

- Aliases are **optional** for external consumers. The frontend (Phase 2.8) now **prefers** `/locations` and `/operations` for API calls.
- Canonical backend routes `/stores` and `/inventories` remain mounted for compatibility.
- Frontend **browser routes** remain `/stores` and `/inventories` (no UI path migration in Phase 2.8).
- Employee APIs remain on `/employees` (not `/workers`) in the frontend for now.
- Do not mix alias path names with expectations of renamed JSON fields — paths are aliased, payloads are not.
- Database physical tables use `operational_locations`, `scheduled_operations`, `operation_assignments` (Phase 2.7); JSON fields unchanged.

## Frontend API preference (Phase 2.8)

| Resource | Preferred frontend API path | Legacy backend path (still available) | Browser route |
|----------|----------------------------|---------------------------------------|---------------|
| Locations | `/locations` | `/stores` | `/stores` |
| Operations | `/operations` | `/inventories` | `/inventories` |
| Employees | `/employees` | `/employees` | `/employees` |
| Location lookups | `/lookups/locations` | `/lookups/stores` | — |
| Operation lookups | `/lookups/operations` | `/lookups/inventories` | — |

**Nested routes without operation alias (frontend keeps canonical path):**

- `/inventories/:inventoryId/employees` — assignment routes; backend has no `/operations/:inventoryId/employees` mount.

**Migrated to operation alias:**

- `/operations/import/preview`
- `/operations/import/confirm`
- `/operations/:id/attendance-summary`

Constants: `frontend/src/api/endpoints.ts`

## Implementation

- Route mounting: `backend/src/routes/index.ts` (`mountInventoryOperationsStoreRoutes`, `mountInventoryOperationsInventoryRoutes`, `mountEmployeeRoutes`).
- Lookup aliases: `backend/src/routes/lookup.routes.ts` (`registerStoreLookupRoute`, `registerInventoryLookupRoute`, `registerEmployeeLookupRoute`).
- Tests: `backend/src/routes/api-route-aliases.test.ts`, `backend/src/routes/api-route-aliases.integration.test.ts`.

## Related docs

- [OPERATIONAL_DOMAIN_GLOSSARY.md](./OPERATIONAL_DOMAIN_GLOSSARY.md)
- [PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md](./PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md)
- [PERMISSIONS.md](./PERMISSIONS.md)
- [COMPANY_MODULES.md](./COMPANY_MODULES.md)
