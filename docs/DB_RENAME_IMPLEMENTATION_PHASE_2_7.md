# DB rename implementation — Phase 2.7

**Status:** Implemented (physical rename + compatibility views)

## Implemented physical renames

| Old table | New physical table | Compatibility view |
|-----------|-------------------|-------------------|
| `stores` | `operational_locations` | `stores` |
| `inventories` | `scheduled_operations` | `inventories` |
| `inventory_employees` | `operation_assignments` | `inventory_employees` |

Migration: `database/migrations/021_physical_operational_table_rename.sql`

## Not renamed

| Table/column | Reason |
|-------------|--------|
| `employees` | HR/absence/bot/phone identification stability |
| `attendance_records` | Already generic; high bot/report coupling |
| `store_id` | Avoid DTO/mapper/API churn |
| `inventory_id` | Avoid DTO/mapper/API churn |
| `employee_id` | Avoid DTO/mapper/API churn |
| Index/constraint names | Cosmetic; deferred |

## Backend SQL files updated

| Area | Files |
|------|-------|
| Repositories | `store.repository.ts`, `inventory.repository.ts`, `inventory-employee.repository.ts`, `lookup.repository.ts`, `attendance.repository.ts`, `absence-request.repository.ts`, `employee.repository.ts`, `inventory-attendance.repository.ts`, `attendance-notification.repository.ts`, `statistics.repository.ts` |
| Store fix utilities | `utils/store-fix/apply.ts`, `sql.ts`, `db-stores.ts` |
| Scripts | `scripts/seed-stores.ts` |
| Constants | `constants/operational-tables.ts` |

## Compatibility policy

- Existing API routes unchanged (`/stores`, `/inventories`, `/employees` and Phase 2.5 aliases).
- Existing JSON fields unchanged (`storeId`, `inventoryId`, `employeeId`, …).
- Existing permission and module keys unchanged.
- Legacy table names are available as **compatibility views** over the physical tables.
- **Application writes must target physical tables** (`operational_locations`, `scheduled_operations`, `operation_assignments`). Do not rely on writing through compatibility views.
- SQL Server simple views are not DML-blocked unless explicit triggers are added (not in scope).

## Migration runner

- File: `database/migrations/021_physical_operational_table_rename.sql`
- Runner: `backend/src/database/run-migrations.ts` — splits batches on standalone `GO` lines; uses `DB_NAME` from env (no hardcoded `USE`).
- View creation uses `EXEC(N'CREATE VIEW ...')` and guards against legacy table name conflicts.

## Validation

Automated:

```bash
cd backend && npm test   # includes operational-table-rename.integration.test.ts
python3 scripts/audit/audit_db_operational_rename.py          # static only
python3 scripts/audit/audit_db_operational_rename.py --live   # + live OBJECT_ID checks when DB env set
```

Manual deploy order:

1. Backup database
2. `cd backend && npm run migrate` (applies 021 on target `DB_NAME`)
3. Run live audit or integration schema test
4. Deploy backend

```bash
cd backend && npm test && npm run build
cd frontend && npm test && npm run build
python3 scripts/audit/audit_tenant_isolation.py
python3 scripts/audit/audit_db_operational_rename.py --live
```

Manual rollback (maintenance window):

```sql
DROP VIEW IF EXISTS dbo.stores;
DROP VIEW IF EXISTS dbo.inventories;
DROP VIEW IF EXISTS dbo.inventory_employees;

EXEC sp_rename 'dbo.operational_locations', 'stores';
EXEC sp_rename 'dbo.scheduled_operations', 'inventories';
EXEC sp_rename 'dbo.operation_assignments', 'inventory_employees';
```

Then revert application code to pre-2.7 SQL table names and redeploy previous release.

Manual SQL after migration:

```sql
SELECT OBJECT_ID('dbo.operational_locations', 'U');
SELECT OBJECT_ID('dbo.scheduled_operations', 'U');
SELECT OBJECT_ID('dbo.operation_assignments', 'U');
SELECT OBJECT_ID('dbo.stores', 'V');
SELECT OBJECT_ID('dbo.inventories', 'V');
SELECT OBJECT_ID('dbo.inventory_employees', 'V');
```

## Related docs

- [DB_RENAME_PLAN_PHASE_2_6.md](./DB_RENAME_PLAN_PHASE_2_6.md)
- [API_ROUTE_ALIASES.md](./API_ROUTE_ALIASES.md)
- [OPERATIONAL_DOMAIN_GLOSSARY.md](./OPERATIONAL_DOMAIN_GLOSSARY.md)
