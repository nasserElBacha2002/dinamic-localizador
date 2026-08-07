# Database Integrity Phase 1 — Tenant Isolation

## 1. Executive Summary

Estado:

```text
COMPLETE
```

Fase 1 endurece la integridad multi-tenant estructural en SQL Server mediante:

* `UNIQUE (company_id, id)` en padres críticos;
* `FOREIGN KEY (company_id, foreign_id)` en hijos críticos;
* `company_id` en `work_team_members` (backfill determinístico desde `work_teams`).

Evidencia: migration `087` aplicada; tests de INSERT SQL directo same-tenant OK / cross-tenant → error 547.

Payroll y workday domain (039 / 082–084) se confirmaron ya protegidos y no se tocados.

## 2. Tenant model

| Clasificación | Ejemplos | Notas |
| ------------- | -------- | ----- |
| TENANT_ROOT | `companies` | raíz |
| TENANT_ENTITY | `employees`, `operational_locations`, `absence_types`, `work_teams` | `company_id NOT NULL` |
| TENANT_CHILD | `attendance_records`, `absence_requests`, `operation_assignments`, … | deben compartir company con padres |
| GLOBAL | `users` | membership vía `user_company_memberships` |
| MIXED_GLOBAL_TENANT | `employee_categories` (`company_id` NULL = global) | trigger existente; **NO_CHANGE** |
| OBSERVABILITY | `whatsapp_conversations`, `whatsapp_flow_*` | `company_id` nullable (H9 deferred) |
| SYSTEM | `system_migrations` | N/A |

## 3. Tables audited

52 tablas con `company_id` en DB live. Prioridad en attendance / operations / absences / work teams / balances / bot / WA notifications.

## 4. Existing composite protections

| Child | Parent | Status |
| ----- | ------ | ------ |
| `employee_workdays` | `employees`, `operation_workdays` | PROTECTED (039) |
| `attendance_records` | `employee_workdays` | PROTECTED (039) |
| `payroll_receipts` | batches / employees | PROTECTED (082) |
| WA payroll notifications | receipts / employees | PROTECTED (083/084) |

## 5. Missing tenant constraints

Antes de 087: ~57 FKs single-column entre entidades tenant. Tras 087: gaps críticos de Phase 1 cerrados (ver §8).

## 6. Migrations added

| File | Acción |
| ---- | ------ |
| `database/migrations/087_phase1_tenant_composite_fks.sql` | preflight + UQs + composites + work_team_members.company_id |
| `database/migrations/rollback/087_phase1_tenant_composite_fks_rollback.sql` | restore single FKs / drop UQs / drop column |

**No** se editó 086 (ya aplicada). Next = **087**.

## 7. Parent unique keys

Agregados (si faltaban):

* `UQ_attendance_records_company_id`
* `UQ_absence_types_company_id`
* `UQ_absence_requests_company_id`
* `UQ_operational_locations_company_id`
* `UQ_work_teams_company_id`
* `UQ_employee_absence_balances_company_id`
* `UQ_absence_request_drafts_company_id`
* `UQ_company_work_calendars_company_id`
* `UQ_operation_assignments_company_id`

Reutilizados: `UQ_employees_company_id`, `UQ_scheduled_operations_company_id`.

## 8. Composite foreign keys

| Child | Parent | Antes | Después | Test cross-tenant | Estado |
| ----- | ------ | ----- | ------- | ----------------- | ------ |
| `attendance_records` | `employees` | FK(employee_id) | FK(company_id, employee_id) | rejected 547 | DONE |
| `attendance_records` | `scheduled_operations` | FK(operation_id) | FK(company_id, operation_id) | covered | DONE |
| `attendance_reviews` | `attendance_records` | FK(attendance_id) | FK(company_id, attendance_id) | schema | DONE |
| `scheduled_operations` | `operational_locations` | FK(service_id) | FK(company_id, service_id) | schema | DONE |
| `operation_assignments` | `employees` | FK(employee_id) | FK(company_id, employee_id) | schema | DONE |
| `operation_assignments` | `scheduled_operations` | FK(operation_id) | FK(company_id, operation_id) | rejected 547 | DONE |
| `operation_assignments` | `work_teams` | FK(source_work_team_id) | FK(company_id, source_work_team_id) | schema | DONE |
| `absence_requests` | `employees` | FK(employee_id) | FK(company_id, employee_id) | schema | DONE |
| `absence_requests` | `absence_types` | FK(absence_type_id) | FK(company_id, absence_type_id) | rejected 547 | DONE |
| `absence_requests` | `company_work_calendars` | FK(calendar_id) | FK(company_id, calendar_id) | schema | DONE |
| `absence_request_attachments` | `absence_requests` / drafts | single | composite | schema | DONE |
| `absence_request_drafts` | `employees` / types | single | composite | schema | DONE |
| balances / ledger | emp / type / balance / request | single | composite | schema | DONE |
| `bot_sessions` | emp / operation | single | composite | schema | DONE |
| `whatsapp_attendance_notifications` | emp / operation | single | composite | schema | DONE |
| `employee_workdays` | `absence_requests` | single | composite | schema | DONE |
| `work_team_members` | `work_teams` / `employees` | single + sin company_id | company_id + composite | rejected 547 | DONE |

Legacy single-column FKs fueron **reemplazadas** (Case B, patrón 082) — no se dejaron duplicadas.

## 9. company_id additions

| Tabla | Acción |
| ----- | ------ |
| `work_team_members` | ADD nullable → backfill desde `work_teams` → NOT NULL + FK companies + composites |

## 10. NOT NULL changes

| Columna | Decisión |
| ------- | -------- |
| `work_team_members.company_id` | NOT NULL (post-backfill) |
| Observability `company_id` nullable | **NO_CHANGE** (H9 deferred — OPTIONAL_CONTEXT / LEGIT_GLOBAL) |
| `employee_categories.company_id` | **NO_CHANGE** (MIXED_GLOBAL_TENANT + trigger) |

## 11. Existing-data preflight

En DB local de desarrollo: **0** filas cross-tenant en todos los checks de 087. Migration aplicada sin THROW.

## 12. Backend compatibility changes

| File | Change |
| ---- | ------ |
| `work-team.repository.ts` | INSERT members incluye `company_id` |
| `work-team.service.ts` | propaga `companyId` a add/replace members |
| `company-data-cascade.service.ts` | DELETE members filtra `company_id` |

## 13. Import/job compatibility

Imports ya resuelven entidades por `companyId` de job. Las FKs nuevas son defensa final (547). No se cambiaron importadores.

## 14. Cross-tenant integration tests

Suite: `database-integrity-phase1.integration.test.ts`

* attendance employee cross-tenant → 547
* operation_assignments operation cross-tenant → 547
* absence type cross-tenant → 547
* work_team_members employee cross-tenant → 547

## 15. Positive regression tests

* same-tenant attendance insert OK
* same-tenant work_team_members insert OK
* composite FK objects present

## 16. Performance/index review

* Parent UQs requeridos por FK (constraint requirement).
* `IX_work_team_members_company_team` para locality tenant.
* No se duplicaron índices `(id, company_id)` estilo payroll salvo donde ya existían.

## 17. Objects intentionally unchanged

* Payroll composites 082–084
* Workday composites 039
* `users` / memberships (GLOBAL)
* `employee_categories` trigger
* Observability nullable company_id (H9)
* Triggers/SPs nuevos: **ninguno**

## 18. Blocked/data-cleanup items

Ninguno en este entorno. Si otra DB tiene mismatches, 087 falla con THROW 50087 y mensaje de relación.

## 19. Validation results

| Command | Result |
| ------- | ------ |
| `npm run migrate` | `087_phase1_tenant_composite_fks.sql` applied |
| `npm run build` | pass |
| Phase 1 integration tests | **7/7 pass** |
| eslint changed sources | pass |

## 20. Remaining risks

* H9 observability `company_id` nullable sigue permitiendo huérfanos teóricos.
* Algunas relaciones tenant de menor prioridad (p. ej. notifications↔conversations si company nullable) quedan para fases posteriores.
* Cascade delete de members por `employee_id` ahora también exige `company_id` en el path de employee delete (corregido).

---

## Clasificación de acciones

| ID | Child | Parent | Riesgo | Acción | Resultado |
| -- | ----- | ------ | ------ | ------ | --------- |
| P1-01 | attendance_records | employees / operations | P1 | ADD_COMPOSITE_FK | DONE |
| P1-02 | attendance_reviews | attendance_records | P1 | ADD_COMPOSITE_FK | DONE |
| P1-03 | operation_assignments | emp / ops / teams | P1 | ADD_COMPOSITE_FK | DONE |
| P1-04 | absence_* | emp / types / requests | P1 | ADD_COMPOSITE_FK | DONE |
| P1-05 | work_team_members | teams / employees | P1 | ADD_COMPANY_ID + ADD_COMPOSITE_FK | DONE |
| P1-06 | payroll | — | — | KEEP_EXISTING | DONE |
| P1-07 | observability company_id | — | P2 | NO_CHANGE | deferred H9 |
| P1-08 | employee_categories | — | — | NO_CHANGE_GLOBAL_MODEL | DONE |
