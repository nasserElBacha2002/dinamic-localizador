# DB rename plan — Phase 2.6 (documentation only)

**Status:** Plan only — superseded for selected tables by **Phase 2.7** implementation.

> **Phase 2.7 update:** Physical rename implemented for `stores`, `inventories`, and `inventory_employees` with legacy compatibility views. See [DB_RENAME_IMPLEMENTATION_PHASE_2_7.md](./DB_RENAME_IMPLEMENTATION_PHASE_2_7.md). `employees` and `attendance_records` remain unchanged. Columns remain unchanged.

## 1. Executive summary

Database rename from legacy operational names (`stores`, `inventories`, `employees`, …) to generic SaaS terminology is **optional** and **not recommended in the current product stage**.

**Current recommendation: defer.**

The production system already has stable DB/API contracts. Product-facing terminology is handled safely through:

- Frontend terminology layer (`frontend/src/domain/terminology.ts`)
- Backend conceptual type aliases (`backend/src/types/operational-domain.ts`)
- Bulk import column aliases (Phase 2.4)
- Optional API route aliases `/locations`, `/operations`, `/workers` (Phase 2.5)

Renaming database tables/columns would be a high-risk, cross-cutting change with limited user-visible benefit while the API and JSON fields intentionally remain stable.

---

## 2. Current technical schema

### Full relevant table inventory

| Table | Purpose |
|-------|---------|
| `companies` | Tenant root |
| `stores` | Physical/geofenced work sites |
| `inventories` | Scheduled work operations |
| `inventory_employees` | Worker assignments to operations |
| `employees` | People who can be assigned and check in |
| `attendance_records` | Check-in/check-out with geolocation evidence |
| `absence_types` | Absence catalog per company |
| `absence_requests` | Absence workflow |
| `absence_request_events` | Absence audit trail |
| `employee_absence_balances` | Absence balances |
| `bot_sessions` | WhatsApp bot session state |
| `whatsapp_messages` | Inbound/outbound message log |
| `whatsapp_attendance_notifications` | Reminder deduplication |
| `company_modules` | Per-company feature flags |
| `company_settings` | Per-company runtime settings |
| `user_company_memberships` | User ↔ company role mapping |
| `users` | Platform and company users |
| `audit_logs` | System audit |
| `attendance_reviews` | Manual attendance review |
| `bot_simulation_sessions` | Bot simulator |

### Operational focus tables

| Table | Key columns (FK pattern) | Tenant column |
|-------|--------------------------|---------------|
| `stores` | `id`, `name`, `latitude`, `longitude`, `allowed_radius_meters` | `company_id` |
| `inventories` | `id`, `store_id`, `scheduled_start`, `scheduled_end`, tolerances | `company_id` |
| `inventory_employees` | `inventory_id`, `employee_id` | via parent inventory |
| `employees` | `id`, `full_name`, `phone_number`, `employee_type` | `company_id` |
| `attendance_records` | `inventory_id`, `employee_id`, geolocation fields | `company_id` |

---

## 3. Proposed future names

### Tables

| Current table | Future conceptual name | Recommendation |
|---------------|------------------------|----------------|
| `stores` | `operational_locations` | Optional — high impact |
| `inventories` | `scheduled_operations` | Optional — high impact |
| `inventory_employees` | `operation_assignments` | Optional — high impact |
| `employees` | `workers` | **Not recommended** unless product fully moves away from HR wording |
| `attendance_records` | `operation_attendance_records` | **Not recommended** unless reporting/API also renamed |

### Columns (future — do not rename without dedicated migration phase)

| Current column | Possible future name |
|----------------|---------------------|
| `store_id` | `operational_location_id` |
| `inventory_id` | `scheduled_operation_id` |
| `employee_id` | `worker_id` |

**Rule:** Do not rename columns until there is a dedicated migration phase with full API/consumer coordination.

---

## 4. Impact analysis

| Area | Impact if tables/columns renamed |
|------|----------------------------------|
| **Migrations** | All historical migrations remain; new rename migration must be additive + reversible; migration ordering risk |
| **Seeds / fixtures** | All seed scripts and test fixtures referencing table names |
| **Repositories** | ~15+ repository files with raw SQL table/column names |
| **SQL queries** | Hundreds of queries across repositories, statistics, bot, reminders |
| **Row mappers** | Every mapper expecting `store_id`, `inventory_id`, etc. |
| **Services** | Business logic keyed to legacy domain names |
| **DTOs / API contracts** | JSON fields (`storeId`, `inventoryId`, `employeeId`) must stay or version |
| **Frontend clients** | All API types and hooks — currently use canonical routes and legacy JSON fields |
| **Import/export** | CSV/XLSX column aliases map to store/inventory semantics internally |
| **Twilio bot** | Check-in/check-out resolves `inventory_id`, `store_id`, `employee_id` in SQL |
| **Tests** | Unit, integration, tenant isolation, bot simulator tests |
| **Dashboards / statistics** | SQL aggregations and export headers |
| **Tenant isolation audit** | `company_id` filters must remain correct on renamed tables |
| **Deployment / rollback** | Maintenance window, coordinated app + DB deploy |
| **External integrations** | Any consumer expecting stable JSON field names |

---

## 5. Risk matrix

### Critical

| Risk | Description |
|------|-------------|
| Breaking migrations | Renaming breaks reproducible migration history on fresh installs |
| Breaking API clients | Consumers expect `storeId`, `inventoryId`, `employeeId` in JSON |
| Breaking imports/exports | Column mapping and validation tied to store lookup |
| Breaking tenant isolation | Incorrect `company_id` joins after rename |
| Breaking bot flows | Check-in/check-out SQL and session state reference legacy IDs |

### High

| Risk | Description |
|------|-------------|
| Long-running production migration | Table renames lock large tables |
| Incorrect FK remapping | Orphaned assignments or attendance records |
| Historical audit mismatch | Reports spanning pre/post rename periods |
| Support confusion | Mixed terminology in logs, DB, and UI |

### Medium

| Risk | Description |
|------|-------------|
| Test fixture churn | Broad test updates across backend and integration suites |
| Documentation drift | Docs, runbooks, and SQL snippets outdated |
| Developer confusion | Dual naming during transition |

### Low

| Risk | Description |
|------|-------------|
| Internal type name mismatch | TypeScript aliases already bridge this gap |

---

## 6. Recommended strategy (if DB rename is ever needed)

### Phase A — SQL views only (no table rename)

Create read-only views with conceptual names:

```sql
CREATE VIEW operational_locations AS SELECT * FROM stores;
CREATE VIEW scheduled_operations AS SELECT * FROM inventories;
CREATE VIEW operation_assignments AS SELECT * FROM inventory_employees;
-- workers view only if product decision confirms HR deprecation
```

### Phase B — Read-only repository aliases

Optional repository methods reading from views for reporting/analytics. **No writes** through views initially.

### Phase C — Dual-write / compatibility layer

**Not recommended** unless external reporting hard-requires new table names. Adds complexity and consistency risk.

### Phase D — Controlled table rename migration

Only after:

- Full integration test coverage for rename path
- Rollback scripts tested on staging clone
- Maintenance window approved
- All consumers notified (or JSON versioning in place)

Use `sp_rename` or create-new-table + copy + swap with FK updates in a single transaction where possible.

### Phase E — Backward-compatible views with old names

After rename, keep views named `stores`, `inventories`, `employees` pointing to new tables for rollback and external SQL clients.

---

## 7. Rollback plan

1. **Pre-migration**
   - Full database backup (point-in-time recovery verified)
   - Record row counts per operational table
   - Tag application release for quick revert

2. **During migration**
   - Run in maintenance window
   - Use explicit transaction boundaries per table group
   - Log each rename step with timestamp

3. **Rollback scripts**
   - Reverse rename migration (views → tables swap)
   - Restore compatibility views with legacy names
   - Re-deploy previous application version if code changed

4. **Post-rollback validation**
   - Health check: `GET /api/health`
   - Smoke: bot check-in/check-out on test inventory
   - Smoke: import preview with `Sucursal, Fecha`
   - Tenant isolation audit: `python3 scripts/audit/audit_tenant_isolation.py`

---

## 8. Validation plan

### Row counts (before / after)

```sql
SELECT 'stores' AS t, COUNT(*) AS c FROM stores
UNION ALL SELECT 'inventories', COUNT(*) FROM inventories
UNION ALL SELECT 'inventory_employees', COUNT(*) FROM inventory_employees
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'attendance_records', COUNT(*) FROM attendance_records;
```

### FK integrity

```sql
-- Inventories without store
SELECT COUNT(*) FROM inventories i
LEFT JOIN stores s ON s.id = i.store_id
WHERE s.id IS NULL;

-- Assignments without parent
SELECT COUNT(*) FROM inventory_employees ie
LEFT JOIN inventories i ON i.id = ie.inventory_id
LEFT JOIN employees e ON e.id = ie.employee_id
WHERE i.id IS NULL OR e.id IS NULL;

-- Attendance without inventory/employee
SELECT COUNT(*) FROM attendance_records ar
LEFT JOIN inventories i ON i.id = ar.inventory_id
LEFT JOIN employees e ON e.id = ar.employee_id
WHERE i.id IS NULL OR e.id IS NULL;
```

### Tenant isolation (per company)

```sql
SELECT company_id, COUNT(*) FROM stores GROUP BY company_id;
SELECT company_id, COUNT(*) FROM inventories GROUP BY company_id;
SELECT company_id, COUNT(*) FROM employees GROUP BY company_id;
```

### Application smoke tests

- Attendance check-in / check-out via bot simulator
- Import preview: `Sucursal,Fecha` and `PUNTO,Fecha`
- Statistics summary endpoints
- API alias routes vs canonical routes (same response shape)
- Frontend regression on `/stores`, `/inventories`, `/employees` pages

---

## 9. Recommendation

**Do not rename DB tables in the current product stage.**

Keep DB and API technical names stable. Use the safer terminology bridge already in place:

| Layer | Mechanism |
|-------|-----------|
| UI (Spanish) | `frontend/src/domain/terminology.ts` |
| Backend types | `backend/src/types/operational-domain.ts` |
| Import files | Column aliases (`Sucursal`, `Ubicación`, …) |
| API paths (optional) | `/locations`, `/operations`, `/workers` |

Revisit DB rename only if:

- External enterprise customers require DB-level naming alignment, **and**
- A dedicated migration phase with versioning/rollback is funded, **and**
- JSON field stability strategy is explicitly decided (versioned API vs permanent legacy fields).

---

## Related docs

- [OPERATIONAL_DOMAIN_GLOSSARY.md](./OPERATIONAL_DOMAIN_GLOSSARY.md)
- [API_ROUTE_ALIASES.md](./API_ROUTE_ALIASES.md)
- [PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md](./PHASE_2_OPERATIONAL_DOMAIN_AUDIT.md)
- [MULTI_COMPANY_HARDENING.md](./MULTI_COMPANY_HARDENING.md)
