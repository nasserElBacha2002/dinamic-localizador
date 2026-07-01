# Phase 2 — Operational Domain Terminology Audit

**Stage:** Phase 2.1 — Audit and design  
**Status:** Complete (read-only; no runtime changes)  
**Date:** 2026-06-23  
**Validated:** Backend `npm test` (315 pass), `npm run build` (pass); Frontend `npm test` (102 pass), `npm run build` (pass); `python3 scripts/audit/audit_tenant_isolation.py` (no findings)

---

## 1. Executive summary

Dinamic Attendance began as a **store inventory attendance** product. Phase 1 delivered multi-company SaaS foundations (tenant isolation, permissions, modules, company settings, bot runtime settings) **without renaming** the operational domain. The codebase is deeply anchored to **stores**, **inventories**, and **employees** at every layer except product vision docs.

**Key findings:**

- **Database:** 8 core operational tables use legacy English names (`stores`, `inventories`, `employees`, `inventory_employees`, `attendance_records`). Phase 1 explicitly deferred renames to `locations` / `operations`. Column renames on `stores` (Spanish → English) already happened in migration `008`.
- **API:** All REST paths use `/stores`, `/inventories`, `/employees`, `/attendance`. Dual mount under `/api` and `/api/companies/:companyId` doubles surface area but does not add alias endpoints.
- **Frontend:** ~30 files contain hardcoded Spanish labels (`Tienda`, `Inventario`, `Empleado`). No i18n or terminology abstraction layer exists. Routes mirror API (`/stores`, `/inventories`, `/employees`).
- **WhatsApp bot:** User-facing copy is Spanish and inventory-centric (`inventario`, `tienda` via `storeName`). Intents `Llegué` / `Me voy` / `Terminé` are operationally sensitive and tied to approved Twilio templates.
- **Imports/exports:** CSV/XLSX formats are client-specific (`PUNTO`/`Fecha`, `tienda`/`fecha_inicio`). Attendance CSV export uses Spanish headers (`Tienda`, `Inventario`, `Empleado`).
- **Permissions/modules:** Technical keys are stable English (`stores:read`, `inventory_operations`). UI labels are partially generic already (`Operaciones de inventario` module label).
- **Recommendation:** Do **not** rename DB tables or API paths in Phase 2.2–2.4. Introduce a **terminology mapping layer** in the frontend first, then optional backend aliases and import column aliases later. Bot wording changes only after product sign-off, ideally company-configurable.

**Proposed conceptual mapping (not final names):**

| Current technical | Future concept | Proposed Spanish UI (draft) |
|-------------------|----------------|----------------------------|
| `stores` | Operational location | Ubicación |
| `inventories` | Scheduled operation | Operación |
| `employees` | Worker / collaborator | Colaborador |
| `inventory_employees` | Operation assignment | Asignación |
| `attendance_records` | Attendance at operation | Asistencia (unchanged) |

---

## 2. Current terminology inventory

### 2.1 Search methodology

Searched backend, frontend, `database/migrations`, docs, tests, and scripts for domain terms (English and Spanish). Counts below are **file-level matches** (a file counts once per pattern), useful for relative blast radius—not exact string occurrences.

| Term pattern | Approx. files | Primary layers |
|--------------|---------------|----------------|
| `store` / `stores` | ~95 | DB, API, repos, types, frontend routes, UI, scripts |
| `inventory` / `inventories` | ~95 | DB, API, bot, import, frontend |
| `employee` / `employees` | ~100 | DB, API, bot, absences, frontend |
| `attendance` | ~90 | DB, API, bot, stats, frontend |
| `absence` / `ausencia` | ~45 | DB, API, bot, frontend |
| `tienda` / `tiendas` (Spanish) | ~24 | UI labels, README, import, bot context |
| `inventario` / `inventarios` (Spanish) | ~35 | UI, bot messages, README |
| `empleado` / `empleados` (Spanish) | ~35 | UI, bot, README |
| `geofence` / `radio` / `allowed_radius` | ~25 | DB columns, bot, settings, UI |
| `assignment` / `assigned` | ~20 | `inventory_employees`, services, UI |
| `location` / `ubicación` | ~15 | Mixed: geolocation UI, bot location prompts (not domain rename) |

### 2.2 Categorized inventory by concept

#### Stores (`store`, `stores`, `tienda`)

| Where | Examples | Layer |
|-------|----------|-------|
| DB | `stores` table; `store_id` FK on `inventories`; `allowed_radius_meters`, `store_format` | Schema |
| API | `GET/POST /stores`, `/lookups/stores`; permissions `stores:read`, `stores:manage` | Contract |
| Backend code | `store.repository.ts`, `store.service.ts`, `Store` type in `domain.ts` | Code |
| Frontend routes | `/stores`, `/stores/new`, `/stores/:id` | Route |
| UI labels | Nav **Tiendas**; pages **Nueva tienda**, **Editar tienda**; column **Tienda** | UI label |
| Bot | `inventory.storeName` in prompts (store name, not word "tienda") | Bot message |
| Import | Legacy header `tienda`; client format uses `PUNTO` (store code) | CSV/XLSX |
| Permissions | `stores:read`, `stores:manage` | Permission key |
| Docs | README domain model; `COMPANY_MODULES.md` | Docs |
| Scripts | `seed-stores.ts`, `reconcile-stores.ts`, `export-database-stores.ts` | Ops scripts |

**Change risk:** HIGH for DB/API; MEDIUM for UI labels; LOW for docs.

#### Inventories (`inventory`, `inventories`, `inventario`)

| Where | Examples | Layer |
|-------|----------|-------|
| DB | `inventories`, `inventory_employees`; `inventory_id` on attendance, bot sessions | Schema |
| API | `/inventories`, `/inventories/:id/employees`, `/lookups/inventories` | Contract |
| Backend | `inventory.service.ts`, `bot-inventory.selector.ts`, `inventory-import.service.ts` | Code |
| Frontend routes | `/inventories`, `/inventories/import`, `/inventories/:id` | Route |
| UI labels | Nav **Inventarios**; **Planificá jornadas de inventario** | UI label |
| Bot | "inventario" throughout `bot-response.builder.ts` | Bot message |
| Import | `fecha_inicio`, `fecha_fin`; client `Fecha` | CSV/XLSX |
| Permissions | `inventories:read`, `inventories:manage` | Permission key |
| Modules | `inventory_operations` | Module key |

**Change risk:** HIGH everywhere except module key (already partially generic).

#### Employees (`employee`, `employees`, `empleado`)

| Where | Examples | Layer |
|-------|----------|-------|
| DB | `employees`; `employee_type` values `fijo`/`eventual` (Spanish) | Schema |
| API | `/employees`, `/inventories/:id/employees`, `/lookups/employees` | Contract |
| Frontend | `/employees`, EmployeeForm, autocompletes | Route + UI |
| Bot | `UNKNOWN_EMPLOYEE_MESSAGE` ("empleado activo") | Bot message |
| Permissions | `employees:read`, `employees:manage` | Permission key |

**Change risk:** HIGH for DB/API; MEDIUM for UI; LOW-MEDIUM for bot (single message family).

#### Attendance (`attendance`, `asistencia`)

| Where | Examples | Layer |
|-------|----------|-------|
| DB | `attendance_records`, `attendance_reviews` | Schema |
| API | `/attendance`, `/attendance/export.csv` | Contract |
| UI | Nav **Asistencias**; export/review flows | UI label |
| Bot | Check-in/out validation; intents `Llegué`, `Me voy` | Bot + intent |
| Module | `attendance` | Module key |

**Change risk:** LOW for table name (stable); MEDIUM for UI; HIGH for bot intents (operational).

#### Absences (`absence`, `ausencia`)

| Where | Examples | Layer |
|-------|----------|-------|
| DB | `absence_types`, `absence_requests`, `employee_absence_balances` | Schema |
| API | `/absence-types`, `/absence-requests` | Contract |
| UI | Nav **Ausencias** | UI label |
| Bot | "Quiero pedir vacaciones", absence flow | Bot message |
| Permissions | `absences:read`, `absences:review` | Permission key |

**Change risk:** LOW–MEDIUM. Concept is already generic HR terminology.

#### Location / geofence (geographic, not domain rename)

| Where | Examples | Layer |
|-------|----------|-------|
| DB | `latitude`, `longitude`, `allowed_radius_meters`, checkout coords | Schema |
| Code | `geolocation.service.ts`, `bot-geofence.validator.ts` | Code |
| UI | **Radio permitido**, **Dentro del radio**, location picker | UI label |
| Bot | "Compartí tu ubicación actual", "fuera del radio permitido" | Bot message |
| Settings | `defaultRadiusMeters`, `geofenceReviewMarginMeters` | Config |

**Change risk:** LOW for renaming concept; UI already uses **ubicación** in bot location prompts.

#### Assignment (`inventory_employees`, assigned)

| Where | Examples | Layer |
|-------|----------|-------|
| DB | `inventory_employees` junction table | Schema |
| API | `POST/GET/DELETE /inventories/:inventoryId/employees` | Contract |
| UI | **Empleados asignados**, assign/unassign actions | UI label |

**Change risk:** MEDIUM (tied to inventory rename if ever done).

---

## 3. Database impact matrix

| Current table/column | Current meaning | Proposed generic concept | Rename now? | Risk | Notes |
|----------------------|-----------------|--------------------------|-------------|------|-------|
| `stores` | Geofenced work site | Operational location | **No** | Critical | 15+ FK references; deferred in `015`, `MULTI_COMPANY_PHASE1.md` |
| `stores.store_format` | Retail format (Carrefour) | Location type / site format | No | High | Domain-specific values in CHECK constraint |
| `stores.allowed_radius_meters` | Geofence radius | Location geofence radius | No | Medium | Name is already generic |
| `inventories` | Scheduled work session at a store | Scheduled operation | **No** | Critical | Core to bot, attendance, imports |
| `inventories.store_id` | Parent location | `location_id` (future) | No | Critical | |
| `employees` | Person who checks in | Worker / collaborator | **No** | Critical | WhatsApp phone lookup keyed here |
| `employees.employee_type` | `fijo` / `eventual` | Employment type | No | Medium | Spanish enum values in DB |
| `inventory_employees` | Assignment of worker to operation | Operation assignment | **No** | High | Junction; name encodes inventory |
| `attendance_records` | Check-in/out event | Operation attendance | **No** | High | Name is already fairly generic |
| `attendance_records.inventory_id` | Operation context | `operation_id` (future) | No | Critical | |
| `attendance_records.employee_id` | Worker context | Stable | No | Low | |
| `attendance_reviews` | Manual review audit | Unchanged | No | Low | |
| `absence_*` tables | HR absence workflow | Unchanged | No | Low | Already generic |
| `company_modules.module_key` | Feature flags | Unchanged keys | No | Medium | `inventory_operations` is partial bridge |
| `company_settings` | Bot/ops config | Unchanged | No | Low | Uses generic field names |
| `bot_sessions.inventory_id` | Active operation in session | Future alias only | No | High | |
| `bot_simulation_sessions.store_id` | Simulated location | Future alias only | No | Medium | |

**Recommendation:** Keep all table and column names stable through Phase 2.5. Document conceptual mapping in a glossary. Any DB rename belongs in Phase 2.6+ with full migration, view compatibility layer, and rollback plan.

---

## 4. Backend API impact matrix

| Current endpoint | Current concept | Future concept | Keep endpoint? | Add alias later? | Risk |
|------------------|-----------------|----------------|----------------|------------------|------|
| `GET/POST /stores` | Stores | Locations | **Yes** | `/locations` → same handler | High if removed |
| `GET/POST /inventories` | Inventories | Operations | **Yes** | `/operations` | High |
| `POST /inventories/import/*` | Bulk inventory upload | Bulk operation upload | **Yes** | Optional `/operations/import` | High (client spreadsheets) |
| `GET/POST /inventories/:id/employees` | Assignments | Operation assignments | **Yes** | `/operations/:id/workers` | Medium |
| `GET/POST /employees` | Employees | Workers | **Yes** | `/workers` or `/collaborators` | High |
| `GET /attendance` | Attendance list | Same | **Yes** | None needed | Low |
| `GET /attendance/export.csv` | CSV export | Same | **Yes** | Optional header localization | Medium |
| `GET /lookups/stores` | Store filter data | Location lookups | **Yes** | `/lookups/locations` | Medium |
| `GET /lookups/inventories` | Inventory filter data | Operation lookups | **Yes** | `/lookups/operations` | Medium |
| `GET /lookups/employees` | Employee filter data | Worker lookups | **Yes** | `/lookups/workers` | Medium |
| `GET /statistics/attendance/by-inventory` | Stats by inventory | Stats by operation | **Yes** | `by-operation` alias | Low |
| `GET /statistics/attendance/by-location` | Stats by store | Stats by location | **Yes** | Already uses "location" | Low |
| `GET/POST /bot-simulator/*` | Bot testing | Same | **Yes** | None | Low |
| `GET /absence-types`, `/absence-requests` | Absences | Same | **Yes** | None | Low |

**DTO / type names:** `Store`, `Inventory`, `Employee` in `backend/src/types/domain.ts` are mirrored in frontend types. Renaming types without aliases breaks serialization contracts.

**Recommendation:** Keep all endpoints. Phase 2.5 may add **read-only aliases** that delegate to existing controllers. Permission keys on aliases must remain identical.

---

## 5. Frontend terminology matrix

Representative sample (full replacement would touch ~30+ files).

| Current label | File / component | Current concept | Proposed generic label | Change now? | Risk |
|---------------|------------------|-----------------|------------------------|-------------|------|
| Tiendas | `company-modules.ts` nav | Stores | Ubicaciones | No (Phase 2.2) | Low |
| Inventarios | `company-modules.ts` nav | Inventories | Operaciones | No | Medium (user habit) |
| Empleados | `company-modules.ts` nav | Employees | Colaboradores | No | Medium |
| Asistencias | nav | Attendance | Asistencias (keep) | No | Low |
| Nueva tienda | `StoreCreatePage.tsx` | Store create | Nueva ubicación | No | Low |
| Planificá jornadas de inventario | `InventoriesListPage.tsx` | Inventory planning | Planificá operaciones | No | Medium |
| Tienda (column/filter) | `AttendanceListPage.tsx`, stats tables | Store | Ubicación | No | Low |
| Inventario (column) | `AttendanceListPage.tsx` | Inventory | Operación | No | Low |
| Empleado (column) | Multiple tables | Employee | Colaborador | No | Low |
| Operaciones de inventario | `COMPANY_MODULE_LABELS` | Module label | Operaciones | No | Low (already partial) |
| Radio permitido | `StoreForm.tsx` | Geofence | Radio permitido (keep) | No | Low |
| Dentro del radio | `labels.ts` | Geofence status | Keep | No | Low |
| Inventarios afectados | `AbsenceDetailPage.tsx` | Affected inventories | Operaciones afectadas | No | Low |
| Simulador de Bot | nav | Bot simulator | Keep | No | Low |

**Routes (unchanged in Phase 2.2):** `/stores`, `/inventories`, `/employees`, `/attendance` — path segments stay for bookmark and API alignment.

### Proposed terminology layer (Phase 2.2 — not implemented)

```typescript
// frontend/src/domain/terminology.ts (proposed)
export const terminology = {
  store: {
    singular: "Ubicación",
    plural: "Ubicaciones",
    legacySingular: "Tienda",
    legacyPlural: "Tiendas",
  },
  inventory: {
    singular: "Operación",
    plural: "Operaciones",
    legacySingular: "Inventario",
    legacyPlural: "Inventarios",
  },
  employee: {
    singular: "Colaborador",
    plural: "Colaboradores",
    legacySingular: "Empleado",
    legacyPlural: "Empleados",
  },
  attendance: {
    singular: "Asistencia",
    plural: "Asistencias",
  },
} as const;
```

**Assessment:** This is the right path. Benefits:

- Single source for Spanish product copy
- `legacy*` keys support gradual rollout and company-specific overrides later
- No API or route changes required
- Enables feature flag: `useLegacyTerminology` per company (future)

Start with nav + page titles + table headers; leave error messages from API unchanged until backend adopts parallel message keys.

---

## 6. WhatsApp bot terminology impact

| Message / function | Current term | Suggested generic term | Risk | Recommendation |
|--------------------|--------------|------------------------|------|----------------|
| Check-in intent | `Llegué` | Keep | **Critical** | Do not change; approved template language |
| Check-out intent | `Me voy`, `Terminé` | Keep | **Critical** | `intent.ts` documents Twilio alignment |
| Greeting menu | "registrar tu llegada" | Keep | High | |
| Inventory prompts | "inventario" (11+ strings) | "operación" | High | Defer until UI + HR comms aligned |
| Store in prompt | `${storeName}` (data) | Same | Low | Name is client data, not label |
| No inventory message | "inventario asignado" | "operación asignada" | High | |
| Selection prompt | "seleccioná el inventario" | "seleccioná la operación" | High | |
| Unknown employee | "empleado activo" | "colaborador" | Medium | Defer |
| Location request | "ubicación actual" | Keep | Low | Already generic |
| Geofence rejection | "fuera del radio permitido" | Keep | Low | |
| Absence intents | "vacaciones", "ausencia" | Keep | Low | HR-generic already |
| Checkout reminder | "finalices el inventario" | "finalices la operación" | Medium | |
| `parseInventorySelection` | function name | `parseOperationSelection` (code only) | Low | Internal rename only in Phase 2.3 |

**Files:** `backend/src/services/bot/bot-response.builder.ts`, `backend/src/utils/intent.ts`, `backend/src/services/bot/bot-intent.parser.ts`, `backend/src/services/whatsapp-bot.service.ts`

**Recommendation:**

1. **Phase 2.1–2.4:** No bot copy changes.
2. **Phase 2.5+:** Company-configurable labels via `company_settings` or operation-type metadata.
3. Prefer **operación** over **trabajo** / **tarea** in Spanish (neutral for inventory, visits, audits).
4. Keep **Llegué** / **Me voy** as universal verbs—they are not domain-specific.

---

## 7. CSV/XLSX import/export impact

### Import formats

| File / flow | Current columns | Business meaning | Proposed generic terminology | Risk |
|-------------|-----------------|------------------|------------------------------|------|
| Client format (`CLIENT_IMPORT`) | `PUNTO`, `Fecha` | Store code + inventory date | `UBICACION`/`CODIGO` + `FECHA` alias | **Critical** |
| Legacy format | `tienda`, `fecha_inicio`, `fecha_fin` | Store name + schedule window | `ubicacion` aliases | **Critical** |
| Ignored headers | `local`, `formato`, `proveedor` | Client metadata | Keep ignored | Low |
| Optional | `tolerancia_temprana`, `tolerancia_tardia`, `notas` | Schedule tolerances | Keep | Low |
| Preview UI | PUNTO, Tienda resuelta, Fecha inventario | User feedback | Ubicación resuelta, Fecha operación | Medium (UI only) |

**Constants:** `backend/src/constants/inventory-import.ts`  
**Service:** `backend/src/services/inventory-import.service.ts`

### Export formats

| File / flow | Current columns | Proposed change | Risk |
|-------------|-----------------|-----------------|------|
| Attendance CSV | Empleado, Tienda, Inventario, … | Add alias headers later; keep current | High |
| Statistics exports | Tienda, Inventario in tables | UI terminology layer | Medium |
| Store reconciliation scripts | Carrefour-specific CSV | Out of product scope | N/A |

**Recommendation:**

- Phase 2.4: Accept **additional** header aliases; normalize internally to existing field mapping.
- Never remove `PUNTO`, `tienda`, `Fecha` support without deprecation period and client notice.
- Document supported columns in glossary appendix.

---

## 8. Permissions and modules terminology impact

### Module keys

| Key | Current UI label | Proposed UI label | Rename key? |
|-----|------------------|-------------------|-------------|
| `attendance` | Asistencias | Asistencias | **No** |
| `inventory_operations` | Operaciones de inventario | Operaciones | **No** (key stable) |
| `absences` | Ausencias | Ausencias | No |
| `reports` | Reportes | Reportes | No |
| `bot_simulator` | Simulador de Bot | Simulador de Bot | No |

`inventory_operations` is already the best **generic bridge** at the module layer.

### Permission keys

| Permission | Scope | Rename? |
|------------|-------|---------|
| `stores:read`, `stores:manage` | Store CRUD | **No** |
| `inventories:read`, `inventories:manage` | Inventory CRUD + import | **No** |
| `employees:read`, `employees:manage` | Employee CRUD | **No** |
| `attendance:read`, `attendance:review`, `attendance:export` | Attendance | **No** |
| `absences:read`, `absences:review` | Absences | **No** |
| `reports:read`, `reports:export` | Statistics | **No** |
| `bot_simulator:use` | Simulator | **No** |

**Recommendation:**

- Permission keys are **security contracts**. Never rename without migration script updating `user_company_memberships` JSON and all `requirePermission` call sites simultaneously.
- Change **UI labels only** via terminology layer.
- Future optional aliases (e.g. `locations:read` → resolves to `stores:read`) require explicit security review.

**Docs to update in Phase 2.2:** Add glossary section to `PERMISSIONS.md` and `COMPANY_MODULES.md` clarifying key vs label.

---

## 9. Proposed generic domain model

### Current model

```
Company
  └── Stores (geofenced sites)
       └── Inventories (scheduled sessions)
            └── InventoryEmployees (assignments)
                 └── AttendanceRecords (check-in/out)
```

Supporting entities: `AbsenceTypes`, `AbsenceRequests`, `EmployeeAbsenceBalances`, `CompanyModules`, `CompanySettings`.

### Proposed conceptual model

```
Company
  └── OperationalLocations (conceptually: stores)
       └── ScheduledOperations (conceptually: inventories)
            └── OperationAssignments (conceptually: inventory_employees)
                 └── AttendanceRecords (unchanged)
```

Absences attach to **Workers** (employees) orthogonally; may reference affected operations.

### Alternative naming evaluation (Spanish-speaking business context)

| Concept | Option A | Option B | Option C | Recommendation |
|---------|----------|----------|----------|----------------|
| Store | **Ubicación** | Sitio de trabajo | Local | **Ubicación** — already used for GPS; not confused with retail "local" |
| Inventory session | **Operación** | Jornada | Asignación | **Operación** — matches `inventory_operations` module direction |
| Employee | **Colaborador** | Trabajador | Empleado (keep) | **Colaborador** for SaaS breadth; **Empleado** remains legal/HR synonym |
| Assignment | Asignación | Convocatoria | Dotación | **Asignación** — clear in scheduling UIs |
| Attendance | Asistencia | Registro | Fichaje | **Asistencia** — already established |

**Avoid:** "Inventario" for scheduled sessions in new copy—it implies stock counting. Keep in legacy import columns only.

---

## 10. Recommended naming

| Layer | Recommended name | Notes |
|-------|------------------|-------|
| Product UI (Spanish) | Ubicación, Operación, Colaborador, Asistencia | Progressive adoption via terminology.ts |
| Backend concepts (future types) | `OperationalLocation`, `ScheduledOperation`, `Worker` | Type aliases wrapping existing entities |
| Database (stable) | `stores`, `inventories`, `employees` | No change until Phase 2.6+ |
| API paths (stable) | `/stores`, `/inventories`, `/employees` | Aliases optional later |
| Permission keys (stable) | `stores:*`, `inventories:*`, `employees:*` | Never rename lightly |
| Module keys (stable) | `inventory_operations` | UI label → "Operaciones" |
| Bot copy (stable for now) | Current Spanish | Change via company config later |
| Docs | "Operational location (stores table)" | Always map legacy → concept |

---

## 11. Migration strategy

### Phase 2.1 — Audit and design ✅ (this document)

- No code behavior changes.
- Terminology audit and migration plan.

### Phase 2.2 — Frontend terminology layer

1. Add `frontend/src/domain/terminology.ts` (+ optional `useTerminology()` hook).
2. Replace nav labels, page titles, table headers, empty states incrementally.
3. Keep routes, API paths, TypeScript type names unchanged.
4. Add unit tests for terminology helper.
5. Update `COMPANY_MODULE_LABELS.inventory_operations` → "Operaciones".
6. Add `docs/DOMAIN_GLOSSARY.md` (or section in this doc).

**Exit criteria:** No API changes; visual copy uses terminology layer for core screens (nav, lists, attendance).

### Phase 2.3 — Backend domain aliases (internal)

1. Add type aliases / re-exports: `OperationalLocation = Store`, etc.
2. Optional service-layer naming in new code only; repositories unchanged.
3. JSDoc on domain types explaining conceptual mapping.
4. Do **not** change JSON response field names (`storeId`, `inventoryId`).

### Phase 2.4 — Import/export alias support

1. Extend `inventory-import.service.ts` to accept alias headers (`ubicacion`, `operacion_fecha`, etc.).
2. Attendance export: optional `?labels=legacy|generic` query (default legacy).
3. Update import template download to show both column sets.
4. Regression tests for all legacy formats.

### Phase 2.5 — Optional API aliases

1. Mount alias routers: `/locations` → store controller, `/operations` → inventory controller.
2. OpenAPI or docs listing canonical vs alias paths.
3. Integration tests proving identical behavior and permissions.

### Phase 2.6 — Optional DB rename (only if justified)

1. Cost/benefit review with real customer demand.
2. Views: `locations` VIEW → `stores`, etc.
3. Dual-write period or migration with rollback.
4. **Not recommended** before product-market fit across non-inventory verticals.

---

## 12. Risks and mitigations

| Area | Risk | Severity | Recommendation |
|------|------|----------|----------------|
| DB table rename | Breaks migrations, FKs, ORM, reports | Critical | Defer to Phase 2.6; use views if ever needed |
| API path rename | Breaks frontend, integrations | Critical | Aliases only; keep canonical paths |
| Permission key rename | Silent security bugs | Critical | Never rename; UI labels only |
| Bot wording change | Employee confusion, support load | High | Company-configurable; default unchanged |
| CSV import columns | Client spreadsheet breakage | Critical | Add aliases; never remove legacy |
| Mixed terminology during transition | Support confusion | Medium | Glossary + single terminology source |
| Statistics/report labels | Inconsistent exports | Medium | Tie exports to same terminology layer |
| `employee_type` fijo/eventual | Spanish in DB | Low | Map in UI labels; optional enum migration later |
| OPERATOR role docs | Says "Inventarios" only | Low | Update when nav labels change |
| Type renames in TS | Wide diff, merge conflicts | Medium | Aliases only in Phase 2.3 |

---

## 13. Recommended next phase

**Proceed to Phase 2.2 — Frontend terminology layer.**

First implementation PR should:

1. Create `terminology.ts` with store/inventory/employee/attendance strings.
2. Wire `getAdminNavItems` and `COMPANY_MODULE_LABELS` only (smallest visible surface).
3. Add tests for nav label output.
4. No backend, bot, import, or permission changes.

---

## 14. Explicit non-goals (Phase 2.1)

- ❌ Rename database tables or columns
- ❌ Rename API endpoints or JSON field names
- ❌ Change WhatsApp bot messages or intents
- ❌ Change CSV/XLSX import/export formats
- ❌ Rename permission or module keys
- ❌ Change runtime behavior, validations, or geofencing logic
- ❌ Implement terminology layer in code (documented only)
- ❌ Remove or deprecate `stores` / `inventories` / `employees` routes

---

## Appendix A — Key file index

| Area | Paths |
|------|-------|
| Domain types | `backend/src/types/domain.ts`, `frontend/src/types/*.ts` |
| Permissions | `backend/src/constants/company-permissions.ts`, `docs/PERMISSIONS.md` |
| Modules | `backend/src/constants/company-modules.ts`, `docs/COMPANY_MODULES.md` |
| Routes index | `backend/src/routes/index.ts` |
| Frontend nav | `frontend/src/utils/company-modules.ts`, `frontend/src/routes/AppRoutes.tsx` |
| Bot copy | `backend/src/services/bot/bot-response.builder.ts`, `backend/src/utils/intent.ts` |
| Import | `backend/src/constants/inventory-import.ts`, `backend/src/services/inventory-import.service.ts` |
| Attendance export | `backend/src/services/attendance.service.ts` (`exportCsv`) |
| Migrations | `database/migrations/002_core_domain.sql`, `015_multi_company_foundation.sql` |
| Phase 1 deferrals | `docs/MULTI_COMPANY_PHASE1.md`, `docs/MULTI_COMPANY_HARDENING.md` |

## Appendix B — Validation results

```
Backend:  npm test  → 315 passed
          npm run build → OK
Frontend: npm test  → 102 passed
          npm run build → OK
Audit:    python3 scripts/audit/audit_tenant_isolation.py → No findings
```
