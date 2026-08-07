# Database Integrity Audit

**Project:** dinamic-localizador (Dinamic Attendance / WhatsApp Localizador)  
**Date:** 2026-08-07  
**Scope:** SQL Server integrity — triggers, stored procedures, constraints, concurrency, idempotency, audit.  
**Sources:** `database/migrations/` (001–085, 86 files), `backend/src/repositories/`, `backend/src/services/`, `backend/src/jobs/`, `backend/src/database/`.

---

## 1. Executive Summary

**Estado global: `NEEDS_IMPROVEMENT`**

El sistema **no depende de triggers ni stored procedures** (casi ausentes por diseño). La integridad se apoya en:

* raw SQL + repositories (`mssql`);
* transacciones de aplicación;
* **filtered UNIQUE indexes** (patrón fuerte y correcto);
* **UPDLOCK / HOLDLOCK / READPAST** en caminos críticos;
* CHECK constraints de estado;
* FKs (mixto: single-column legacy + composite tenant en dominios nuevos).

**Fortalezas reales (evidencia):**

* Idempotencia WhatsApp/attendance bien respaldada en DB (`MessageSid`, webhook claim unique, active attendance per workday).
* Outbox-style queues con lease (`whatsapp_*_notifications`, `absence_workday_sync_jobs`).
* Payroll: unique de período activo + idempotency key (`081_payroll_receipts.sql`).
* Un trigger justificado: scope de categorías de empleado (`TR_employees_category_company_scope`).

**Debilidades concretas:**

* Invariantes de negocio solo en aplicación (solape de ausencias, review de asistencia, last-owner, geofence).
* Race TOCTOU en ausencia (UPDLOCK sin filas no crea key-range lock bajo READ COMMITTED).
* Review de asistencia sin CAS/`reviewed_at IS NULL` ni unique de review.
* FKs sin `ON DELETE` explícito; comentario en `077` promete SET NULL pero el DDL no lo implementa.
* Auditoría vía `audit_logs` solo cuando el service lo invoca — bypass SQL directo no deja rastro.
* Ningún stored procedure; operaciones multi-tabla viven en TS (aceptable si transacciones + constraints están completas).

**Conclusión guía:** priorizar **constraints / unique / locking / CAS** (Fase 0–1). **No** introducir una capa de triggers/SPs por moda. Triggers/SPs solo donde un constraint no puede expresar la regla.

---

## 2. Arquitectura actual de persistencia

| Aspecto | Hallazgo | Evidencia |
|---------|----------|-----------|
| ORM | **Ninguno** | `backend/package.json`: `mssql` only |
| Driver | `mssql` ConnectionPool | `backend/src/database/connection.ts` |
| Acceso | SQL parametrizado en repositories | `*.repository.ts` (~50) |
| Transacciones | `new sql.Transaction(pool)` + begin/commit | services + algunos repos |
| Helpers | `safeRollback`, `rollbackTransactionSafely` | `backend/src/utils/safe-transaction.ts`, `sql-transaction.ts` |
| Migraciones | `.sql` + `GO` + `system_migrations` | `backend/src/database/run-migrations.ts`, `001_initial_schema.sql` |
| Soft delete | Selectivo (`payroll_receipts`, attachments, companies lifecycle) | `081`, `066`, `079`/`080` |
| Jobs | `setInterval` in-process | `backend/src/jobs/*.ts`, arranque en `server.ts` |
| Outbox genérico | **Ausente** | Queues específicas (notifications, sync jobs, pending GCS deletes) |

### Write paths (dónde se escribe)

| Canal | Entrada | Evidencia |
|-------|---------|-----------|
| HTTP API | `/api/*` routers | `backend/src/routes/` |
| Twilio WhatsApp | `/api/webhooks/twilio/whatsapp` (+ status) | `twilio.routes.ts` |
| Jobs | reminders, materialization, absence sync, payroll notif, company deletion, cleanup | `backend/src/jobs/` |
| Imports | CSV/Excel orchestrator | `backend/src/imports/`, `057_import_jobs.sql` |
| Scripts admin | seed, reconcile, backfill, cleanup | `backend/src/scripts/`, `backend/scripts/` |
| Migrations | DDL/DML | `database/migrations/` |
| Bot simulator | API + virtual sessions | `bot-simulator` routes/services |

**Protección ante escritura fuera del backend:** solo lo que el esquema impone (FK/UNIQUE/CHECK). Un `sa` o script SQL puede violar toda regla de aplicación.

---

## 3. Esquema e integridad existente

### Triggers / procedures / functions

| Objeto | Tipo | Evidencia |
|--------|------|-----------|
| `dbo.TR_employees_category_company_scope` | TRIGGER AFTER INSERT/UPDATE | `054_employee_categories.sql`, `055_employee_categories_company_scope_trigger.sql` |
| `dbo.fn_resolve_operation_timezone_for_sql` | FUNCTION | `039_workday_domain_foundation.sql` |
| Stored procedures | **Ninguno** | No hay `CREATE PROCEDURE` en migraciones |

### Patrones de integridad presentes

* **Filtered UNIQUE:** attendance activa por workday, bot session activa, payroll ASSOCIATED por período, invitations PENDING por email, membership `is_default`, calendarios default, etc.
* **Idempotency UNIQUE:** MessageSid attendance/checkout, webhook `(company, sid, type)`, ledger movements, import jobs, absence drafts/attachments, provider events.
* **CHECK:** status enums, month ranges, geo/status attendance, payroll statuses.
* **Composite tenant FK:** workday domain (`039`), payroll hardening (`082`–`084`).
* **Optimistic version INT/BIGINT:** balances, calendars, schedules, session_version, leases — **no** `ROWVERSION`.
* **ON DELETE CASCADE/SET NULL:** **ausente** en DDL (default NO ACTION).

### Soft-delete filtered unique

* `UX_payroll_receipts_active_period` — `081_payroll_receipts.sql` (`deleted_at IS NULL AND status = ASSOCIATED`).
* `UQ_companies_name` **no** filtra `deleted_at` — riesgo al reusar nombre de empresa soft-deleted.
* `UQ_ara_object_key` **no** filtra soft-delete de attachments.

### Schema drift / notas

* Dos migraciones `048_*` (mismo prefijo numérico).
* `077_whatsapp_observability_corrections.sql` comenta “ON DELETE SET NULL” pero las FKs creadas no lo tienen.
* En el árbol de migraciones del repo auditado, la última es **`085_user_company_membership_default_unique.sql`**. Cualquier cambio posterior (p. ej. múltiples recibos ASSOCIATED / checksum unique) debe auditarse cuando exista en el árbol de migraciones versionado.

---

## 4. Invariantes detectadas

| ID | Regla | Tipo | Protección actual | Mecanismo recomendado |
|----|-------|------|-------------------|------------------------|
| I01 | 1 attendance activa (VALID/PENDING_REVIEW) por employee_workday (real) | A | Filtered UNIQUE `UX_attendance_records_employee_workday_active_real` (`039`) | NO_CHANGE (constraint) |
| I02 | Idempotencia inbound MessageSid → attendance | A | `UQ_attendance_records_source_message_sid` | NO_CHANGE |
| I03 | Idempotencia checkout MessageSid | A | `UQ_attendance_records_checkout_message_sid` (`007`) | NO_CHANGE |
| I04 | 1 bot session activa por employee (no sim) | A | `UX_bot_sessions_active_employee` | NO_CHANGE |
| I05 | Webhook claim único por company+sid+type | A | `UQ_wwe_company_sid_type` (`073`) | NO_CHANGE (+ retry on 2627) |
| I06 | ≤1 ASSOCIATED payroll por employee+period | A | `UX_payroll_receipts_active_period` (`081`) | NO_CHANGE **mientras la política sea 1:1**; si se aprueba multi-receipt, reemplazar por checksum unique |
| I07 | Payroll upload idempotency_key | A | `UX_payroll_receipts_idempotency` | NO_CHANGE |
| I08 | 1 membership default por user | A | `UQ_user_company_memberships_user_default` (`085`) | NO_CHANGE |
| I09 | Invitation PENDING única por company+email | A | `UQ_user_invitations_company_email_pending` (`058`) | NO_CHANGE |
| I10 | Phone único por company | A | `UQ_employees_company_phone_number` (`015`) | NO_CHANGE |
| I11 | Category scope company | B | Trigger `TR_employees_category_company_scope` | NO_CHANGE (trigger justificado; FK simple no alcanza por categorías globales) |
| I12 | No solape ausencias mismas fechas/estados | B | Solo app: `assertNoOverlap` + `hasOverlappingRequest` | LOCKING / SERIALIZABLE o exclusion strategy — ver §5–§6 |
| I13 | Attendance review una sola vez | B | Solo app: `review()` pre-check | UNIQUE + CAS `reviewed_at IS NULL` |
| I14 | No degradar último OWNER activo | C | App: `company-user.guards.ts` + locks en service; test integración | App + locking (ya hay test); constraint difícil |
| I15 | Geofence / radio / grace check-in | C | App bot + config | NO_CHANGE (Tipo C) |
| I16 | Transiciones estado ausencia | B | App + `findByIdForUpdate` + `onlyIfStatusIn` | NO_CHANGE (+ opcional CHECK no cubre transiciones) |
| I17 | Tenant isolation company_id | A/B | Mixto: queries + composite FKs nuevos; FKs single-column legacy | Extender composite FKs en Fase 0/1 |
| I18 | Ledger balance movements idempotentes | A | `UQ_eabm_idempotency` (`064`) | NO_CHANGE |
| I19 | Payroll WhatsApp notif 1:1 receipt+type | A | `UQ_wprn_company_receipt_type` (`083`) | NO_CHANGE |
| I20 | Contadores batch `total_files` | D | App actualiza | NO_CHANGE (no trigger de contador) |

---

## 5. Invariantes protegidas solo por backend

### Regla: No pueden coexistir dos ausencias solapadas (mismos estados activos) para un empleado

```text
Código que la protege:
  absence-request.service.ts → assertNoOverlap / createRequest
  absence-request.repository.ts → hasOverlappingRequest (UPDLOCK,HOLDLOCK si hay transaction)
Qué ocurre con acceso SQL directo:
  INSERT libre si no hay exclusion/unique de rango → solapes posibles
Qué ocurre ante concurrencia:
  Dos creates concurrentes con overlap vacío: ambos SELECT sin filas → sin key-range lock
  → ambos INSERT (phantom) bajo READ COMMITTED
Protección DB posible:
  Lock de fila employee / sp_getapplock por (company,employee) alrededor de check+insert
  o SERIALIZABLE / range locks; exclusion constraint (limitado en SQL Server sin temporal tables)
Recomendación:
  LOCKING (employee UPDLOCK) + transaction wrapping create — PRIORIDAD P1
  NO trigger de solape (lógica de fechas+status es frágil en trigger)
```

### Regla: Una asistencia solo puede revisarse una vez

```text
Código que la protege:
  attendance.service.ts → review() (líneas ~208–216: reviewedAt / hasReview)
  attendance.repository.ts → applyReview UPDATE sin WHERE reviewed_at IS NULL
  attendance_reviews: IX no unique (004_mvp_completion.sql)
Qué ocurre con acceso SQL directo:
  Múltiples reviews / overwrite de validation_status
Qué ocurre ante concurrencia:
  Dos reviewers pasan pre-check → doble insert en attendance_reviews + last-write-wins en attendance_records
Protección DB posible:
  UPDATE ... WHERE reviewed_at IS NULL (CAS)
  UNIQUE (company_id, attendance_id) en attendance_reviews
Recomendación:
  CONSTRAINT + TRANSACTION CAS — P1
```

### Regla: No degradar/eliminar el último OWNER activo de una empresa

```text
Código que la protege:
  company-user.guards.ts → isLastOwnerDemotion
  company-user.service.ts + UPDLOCK en membership paths
  company-user.last-owner.concurrency.integration.test.ts
Qué ocurre con acceso SQL directo:
  UPDATE role/status libre → empresa sin OWNER
Qué ocurre ante concurrencia:
  Mitigado por locks en app (test dedicado); SQL directo no
Protección DB posible:
  Trigger AFTER UPDATE/DELETE counting OWNER ACTIVE (posible pero frágil con multi-row)
  Mejor: mantener app + locking; opcional trigger de seguridad
Recomendación:
  NO_CHANGE corto plazo; TRIGGER opcional P2 solo si hay escrituras admin SQL frecuentes
```

### Regla: Check-in geofence / ventana horaria / asignación

```text
Código que la protege:
  WhatsApp bot / employee-workday-attendance.command.ts + geofence helpers + config BOT_*
Qué ocurre con acceso SQL directo:
  INSERT attendance VALID sin ubicación ni distancia
Qué ocurre ante concurrencia:
  Unique activa evita doble attendance; no valida geofence
Protección DB posible:
  CHECK parcial (coords NOT NULL si VALID) — incompleto vs radio dinámico
Recomendación:
  NO_CHANGE (Tipo C). Opcional CHECK suave P3: VALID ⇒ lat/lon/distance NOT NULL
```

### Regla: Attachments requeridos antes de aprobar ausencia

```text
Código que la protege:
  absence-review.service.ts → assertRequiredAttachmentsSatisfied antes de transition()
Qué ocurre con acceso SQL directo:
  UPDATE status APPROVED sin attachments
Qué ocurre ante concurrencia:
  Attachments pueden borrarse entre assert y transition (P1 menor)
Protección DB posible:
  Difícil (política snapshot JSON). Preferir assert dentro de la misma tx con locks
Recomendación:
  TRANSACTION reorder (app) — P1; NO trigger
```

### Regla: Checkout sin ubicación completa session en la misma unidad atómica

```text
Código que la protege:
  whatsapp-bot.service.ts → processCheckoutWithoutLocation
  (location path sí es same-tx)
Qué ocurre ante fallo:
  Checkout committed + session activa residual
Protección DB posible:
  No constraint; misma transaction en app
Recomendación:
  TRANSACTION (app) — P1; NO_SP necesario
```

---

## 6. Problemas de concurrencia

| ID | Patrón | Evidencia | Riesgo | Solución |
|----|--------|-----------|--------|----------|
| C1 | SELECT overlap vacío → INSERT | `hasOverlappingRequest` | Phantom overlap | Employee lock / applock / SERIALIZABLE |
| C2 | Check reviewed → UPDATE sin CAS | `attendance.service.review` / `applyReview` | Double review | `WHERE reviewed_at IS NULL` + unique reviews |
| C3 | IF NOT EXISTS → INSERT (seed) | absence-types, location-types, settings | Hard fail 2627 en race | Catch expected unique (como balances) |
| C4 | claim webhook empty → INSERT | `whatsapp-webhook-event.repository` | Rethrow ruidoso | On 2627 retry claim path |
| C5 | Promise.all reconcile writes | `employee-workday-absence-reconciliation.service.ts` | Deadlock contention | Monitorear; particiones mutuamente excluyentes |
| C6 | Controles buenos | UPDLOCK en assignments, invitations, payroll replace, notification claim, `sp_getapplock` deactivate | — | NO_CHANGE |

**Isolation:** no se encontró uso de `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` en `backend/src`. El proyecto confía en hints + uniques.

---

## 7. Problemas de idempotencia

| Área | Mecanismo DB | Evidencia | Estado |
|------|--------------|-----------|--------|
| Twilio inbound claim | UNIQUE `(company_id, message_sid, event_type)` | `073` | Fuerte |
| whatsapp_messages | `UQ_whatsapp_messages_message_sid` | `003` | Fuerte |
| Attendance source/checkout SID | UQ filtered | `002`, `007` | Fuerte |
| Absence WhatsApp | `UQ_absence_requests_source_message_sid` | migrations absence | Fuerte |
| Provider events | `UQ_wpe_provider_event_key` | `076` | Fuerte |
| Payroll upload | `UX_payroll_receipts_idempotency` | `081` | Fuerte |
| Import jobs | filtered unique | `057` | Fuerte |
| Ledger / conflicts | UQ idempotency | `064`, `069` | Fuerte |
| Attendance/payroll notification send | unique + lease claim | `011`/`031`, `083`/`084` | Fuerte |
| Batch payroll | sin idempotency a nivel batch | `081` | Gap menor P3 |

---

## 8. Constraints faltantes

| Gap | Evidencia | Recomendación | Prioridad |
|-----|-----------|---------------|-----------|
| Unique review por attendance | `IX_attendance_reviews_attendance_id` non-unique (`004`) | `UQ_attendance_reviews_company_attendance` | P1 |
| CAS reviewed_at | `applyReview` WHERE solo id | `AND reviewed_at IS NULL` | P1 |
| ON DELETE documentado ≠ implementado | `077` comment | Alinear DDL o corregir comentario | P2 |
| `UQ_companies_name` vs soft-delete | `019` vs `079` | Filtered unique `WHERE deleted_at IS NULL` o rename policy | P2 |
| `UQ_ara_object_key` vs soft-delete | `066` | Evaluar filter deleted_at | P2 |
| Composite tenant FKs en tablas legacy | pre-`039` / work_team_members sin company_id (`050`) | Incremental composite FKs | P2 |
| Nullable company_id observability | `076` | Endurecer NOT NULL donde datos lo permitan | P2 |
| CHECK VALID ⇒ coords | attendance | Opcional | P3 |

---

## 9. Índices únicos faltantes

| Propuesta | Tabla | Columnas / filtro | Motivo |
|-----------|-------|-------------------|--------|
| `UQ_attendance_reviews_company_attendance` | `attendance_reviews` | `(company_id, attendance_id)` | Una review lógica |
| (condicional) exclusion/overlap | `absence_requests` | No trivial en SQL Server | Preferir locking |
| Filtered company name | `companies` | name WHERE deleted_at IS NULL | Reuso post soft-delete |
| Checksum unique (solo si multi-receipt) | `payroll_receipts` | period+checksum ASSOCIATED | Política de producto |

**No faltan** uniques críticos de MessageSid / webhook / payroll period (bajo política 1 ASSOCIATED).

---

## 10. Candidatos a Triggers

| Trigger candidato | Tabla | Evento | Objetivo | Justificación | Riesgos | Recomendación |
|-------------------|-------|--------|----------|---------------|---------|---------------|
| (existente) `TR_employees_category_company_scope` | `employees` | AFTER I/U | Category same-company or global | FK simple insuficiente | Bajo (set-based) | **IMPLEMENTAR** (ya existe) — mantener |
| `TR_attendance_reviews_one` | — | — | Una review | Mejor UNIQUE | — | **REEMPLAZAR POR CONSTRAINT** |
| `TR_absence_no_overlap` | `absence_requests` | AFTER I/U | Anti-solape | Fechas+status complejos; multi-row | Deadlocks, bugs | **NO IMPLEMENTAR** → locking app |
| `TR_last_owner` | `user_company_memberships` | AFTER U/D | ≥1 OWNER | Posible | Multi-row, roles | **NO IMPLEMENTAR** corto plazo; P2 si hace falta cinturón |
| `TR_audit_*` genérico | muchas | AFTER U/D | Audit trail | Bypass SQL | Volumen, PII, dual-write con auditService | **NO IMPLEMENTAR** genérico; ver §13 |
| `TR_payroll_counters` | `payroll_receipts` | AFTER I/U/D | total_files | Derivado | Contención | **NO IMPLEMENTAR** |
| `TR_outbox_whatsapp` | receipts | AFTER I | Enviar WA | Side effect | HTTP desde SQL — prohibido | **NO IMPLEMENTAR** |
| `TR_geofence` | attendance | AFTER I | Validar radio | Config dinámica | — | **NO IMPLEMENTAR** |

---

## 11. Candidatos a Stored Procedures

| SP candidata | Flujo actual | Tablas | Atomicidad actual | Problema | Beneficio | Recomendación |
|--------------|--------------|--------|-------------------|----------|-----------|---------------|
| `usp_attendance_checkin` | `createAttendanceForEmployeeWorkday` | attendance, sessions, conflicts | Same-tx + uniques | Bajo | Bajo (duplicaría TS) | **NO** — mantener app |
| `usp_payroll_replace` | `finalizeReplaceInTransaction` | payroll, pending deletions | UPDLOCK + unique | Bajo | Bajo | **NO** |
| `usp_absence_approve` | `absence-review.transition` | request, balances, sync jobs | UPDLOCK + CAS status | Attachment gate fuera | Mejorar tx app, no SP | **NO** |
| `usp_invitation_accept` | `user-invitation.service` | invite, user, membership | Tx + uniques | Bajo | Bajo | **NO** |
| `usp_company_purge_stage` | `company-deletion-purge.service` | muchas | Staged by design | Complejidad | Encapsular admin | **EVALUAR P3** solo mantenimiento |
| `usp_reconcile_*` | scripts reconcile | varias | Scripts | Ops | Operaciones admin | **EVALUAR P3** |

**Costo arquitectónico de mover negocio a SP:** doble implementación TS+SQL, peor testabilidad Node, CI más pesado. **No justificado** mientras las transacciones app + constraints cubran atomicidad.

---

## 12. Casos donde NO usar Trigger/SP

| Tentación | Por qué no |
|-----------|------------|
| Enviar WhatsApp al ASSOCIATED receipt | Side effect externo; ya hay outbox `whatsapp_payroll_receipt_notifications` + job |
| Email invitation desde trigger | Mismo; delivery en app |
| Recalcular estadísticas en trigger | Pesado; queries/materialización |
| Workflow completo check-in en SP | Orquestación Tipo D; geofence/Twilio en app |
| Cascade deletes vía trigger | Usar FK ON DELETE si hace falta |
| Duplicar validación CUIL/filename en trigger | Regla de parseo Tipo C |
| Contadores batch en trigger | Contención; mantener app o vistas |

**Source of truth recomendada:**

* Tipo A → DB constraints  
* Tipo B → DB + app (cinturón y tirantes)  
* Tipo C/D → app (+ outbox para side effects)

---

## 13. Auditoría y trazabilidad

| Mecanismo | Evidencia | Cobertura |
|-----------|-----------|-----------|
| `audit_logs` | `002_core_domain.sql`, `audit.repository.ts`, `audit.service.ts` | Solo si el service llama `auditService.log` |
| `company_lifecycle_events` | `080` | Lifecycle empresas |
| Ledger movements | `064` | Ausencias balance |
| Notification send attempts | `084` | Payroll WhatsApp |

**Gaps:** attendance review escribe audit **después** del commit (`attendance.service.ts`); SQL directo no audita; no hay before/after row-level automático.

**Recomendación:**

* Mantener audit de aplicación como SoT para acciones de negocio con `userId`.
* No trigger genérico masivo (ruido + PII).
* P2: asegurar audit **dentro** de la misma transaction en caminos críticos (review, role change).
* P2: ampliar `company_lifecycle_events`-style solo para dominios admin (roles/memberships) si el riesgo de bypass SQL es real.

---

## 14. Seguridad DB

| Modelo actual | App user con DML amplio sobre tablas (implícito en arquitectura `mssql` + migrations). |
|---------------|----------------------------------------------------------------------------------------|
| EXECUTE-only + SPs | **No viable ahora** sin reescribir todos los repositories. Complejidad operacional desproporcionada. |
| Recomendación | **NO** en Fase 0–3. Mantener least privilege a nivel red/secretos; FKs/uniques como defensa. Revisar EXECUTE-only solo si aparece requisito compliance explícito (Fase 4). |

---

## 15. Outbox / eventos transaccionales

| Queue | Evidencia | Patrón |
|-------|-----------|--------|
| `whatsapp_attendance_notifications` | `011`, `attendance-reminder.job.ts` | Outbox + claim |
| `whatsapp_payroll_receipt_notifications` | `083`/`084`, payroll notification job | Outbox + lease + attempts |
| `absence_workday_sync_jobs` | `061`/`072`, sync job | Work queue + fencing |
| `company_pending_storage_deletions` | `079`/`080` | Async GCS delete |
| `import_jobs` | `057` | Job state |

**Buena práctica ya presente.** Extender el mismo patrón ante nuevos side effects; **no** triggers que inserten outbox si el service ya puede hacer `tx: mutate + insert outbox` (más claro y testeable). Preferir outbox en la misma transaction de aplicación.

---

## 16. Riesgos de performance y locking

* UPDLOCK/HOLDLOCK amplios en paths hot (attendance, sessions, notifications) — correctos pero monitorear deadlocks.
* Trigger de overlap o audit genérico aumentaría bloqueos.
* `Promise.all` en reconcile de workdays — riesgo de deadlock bajo carga.
* Indexes filtered son la herramienta correcta; no reemplazarlos por triggers.

---

## 17. Hallazgos P0

Ninguno que permita **doble efecto de negocio** claro saltándose unique indexes existentes en los caminos money-path (check-in, MessageSid, payroll ASSOCIATED único, webhook claim).

Los más graves son **P1** (pueden corromper datos bajo concurrencia o admin SQL).

---

## 18. Hallazgos P1

| ID | Entidad/flujo | Problema actual | Riesgo | Solución DB recomendada | Tipo | Prioridad |
|----|---------------|-----------------|--------|-------------------------|------|-----------|
| H1 | Absence create/edit overlap | Phantom under READ COMMITTED | Solapes duplicados | LOCKING (employee/applock) + same tx | LOCKING | P1 |
| H2 | Attendance review | No CAS / no unique review | Doble review | UNIQUE + `reviewed_at IS NULL` | CONSTRAINT + TRANSACTION | P1 |
| H3 | Absence approve attachments | Assert fuera de tx | Approve sin docs | TRANSACTION reorder (app) | TRANSACTION | P1 |
| H4 | Checkout sin location | Session complete fuera de tx | Session huérfana activa | TRANSACTION (app) | TRANSACTION | P1 |

---

## 19. Hallazgos P2/P3

| ID | Entidad/flujo | Problema | Solución | Tipo | Prioridad |
|----|---------------|----------|----------|------|-----------|
| H5 | `077` ON DELETE comment vs DDL | Documentación engañosa | Alinear | CONSTRAINT / docs | P2 |
| H6 | Company name unique vs soft-delete | Reuso bloqueado o inconsistente | Filtered unique | INDEX | P2 |
| H7 | Attachment object_key unique vs soft-delete | No reusar key | Evaluar filter | INDEX | P2 |
| H8 | Legacy single-column FKs / work_team_members sin company_id | Cross-tenant teorético | Composite FKs | CONSTRAINT | P2 |
| H9 | Observability nullable company_id | Datos huérfanos | NOT NULL gradual | CONSTRAINT | P2 |
| H10 | Audit after commit (review) | Pérdida de audit si falla post-commit | Audit in-tx | AUDIT | P2 |
| H11 | Seed IF NOT EXISTS sin catch | 500 en race | Catch 2627 | TRANSACTION | P2 |
| H12 | Webhook claim INSERT race throw | Ruido / rare fail | Retry on duplicate | TRANSACTION | P2 |
| H13 | Last owner | Solo app | Opcional trigger | TRIGGER / NO_CHANGE | P2 |
| H14 | VALID sin coords CHECK | Inconsistencia SQL directo | CHECK suave | CONSTRAINT | P3 |
| H15 | Payroll batch idempotency | Retries a nivel batch | Unique batch key si hace falta | INDEX | P3 |
| H16 | Admin purge as SP | Ops | Evaluar SP mantenimiento | STORED_PROCEDURE | P3 |

---

## 20. Roadmap recomendado

### Fase 0 — Sin cambiar arquitectura (hacer primero)

1. **Attendance review CAS + unique** (`H2`) — migration + repo WHERE.  
2. **Absence overlap:** tomar `UPDLOCK` de `employees` (o `sp_getapplock` keyed) dentro de la misma transaction que `assertNoOverlap` + `INSERT` (`H1`).  
3. **Mover attachment assert / checkout session** dentro de la tx existente (`H3`, `H4`).  
4. Corregir comentario o DDL `ON DELETE` en observability (`H5`).  
5. Catch unique en seeds (`H11`); retry webhook claim (`H12`).  
6. Evaluar filtered unique company name / attachment keys (`H6`, `H7`).

### Fase 1 — Integridad crítica

* Extender composite `(company_id, id)` FKs en tablas multi-tenant aún single-column (`H8`).  
* Mantener **único** trigger de categorías; no agregar triggers de overlap/geofence.  
* Si producto pasa a multi-ASSOCIATED payroll: migration que dropee `UX_payroll_receipts_active_period` y agregue checksum unique (no documentar como hecho hasta que exista en migraciones versionadas).

### Fase 2 — Auditoría

* Audit in-transaction en review / membership role changes.  
* No audit trigger genérico.  
* Opcional: event table estilo lifecycle para membership role changes.

### Fase 3 — Atomicidad / SP

* **No** portar check-in/payroll/invites a SP.  
* Solo considerar SP para **purge/reconcile admin** si ops lo necesita (`H16`).

### Fase 4 — Seguridad DB avanzada

* EXECUTE-only: **diferir** salvo compliance. Beneficio bajo vs reescritura total.

---

## Matriz resumen (clasificación §14)

| ID | Entidad/flujo | Problema actual | Riesgo | Solución DB recomendada | Tipo | Prioridad |
| -- | ------------- | --------------- | ------ | ----------------------- | ---- | --------- |
| H1 | Absence overlap | Phantom race | Alto | Employee lock / applock | LOCKING | P1 |
| H2 | Attendance review | Double review | Alto | UNIQUE + CAS | CONSTRAINT | P1 |
| H3 | Absence approve | Attachment TOCTOU | Medio-alto | Same-tx assert | TRANSACTION | P1 |
| H4 | Checkout w/o location | Session not atomic | Medio | Same-tx session complete | TRANSACTION | P1 |
| H5 | Observability FK docs | Misleading ON DELETE | Bajo | Fix DDL/docs | CONSTRAINT | P2 |
| H6 | Company soft-delete name | Unique policy | Medio | Filtered unique | INDEX | P2 |
| H7 | Attachment object_key | Soft-delete reuse | Medio | Filtered unique | INDEX | P2 |
| H8 | Tenant FK legacy | Cross-tenant teorético | Medio | Composite FK | CONSTRAINT | P2 |
| H9 | Observability nullable company | Orphans | Medio | NOT NULL | CONSTRAINT | P2 |
| H10 | Audit post-commit | Lost audit | Medio | In-tx audit | AUDIT | P2 |
| H11 | Seed IF NOT EXISTS | Race 500 | Bajo | Catch unique | TRANSACTION | P2 |
| H12 | Webhook claim insert | Noisy fail | Bajo | Retry | TRANSACTION | P2 |
| H13 | Last owner | App-only | Medio (SQL bypass) | Optional trigger / keep app | NO_CHANGE→TRIGGER? | P2 |
| I01–I11,I18–I19 | Varios | — | — | Ya en DB | NO_CHANGE | — |
| I15 | Geofence | App-only | Esperado | Keep app | NO_CHANGE | — |
| SP* | Business flows | — | — | Keep app txs | NO_CHANGE | — |

---

## Invariantes: source of truth (clasificación A–D)

| Tipo | Significado | Ejemplos en este sistema |
|------|-------------|--------------------------|
| **A** Estructural DB | FK, UNIQUE, CHECK, NOT NULL | MessageSid, active attendance, payroll ASSOCIATED period, invitation pending |
| **B** Invariante crítica DB+app | Locking + unique/CAS | Absence overlap (hoy solo app → debe subir), attendance review |
| **C** Negocio app | Validaciones de dominio | Geofence, parseo CUIL, mensajes WhatsApp, políticas de attachment |
| **D** Orquestación app | Workflows / side effects | Jobs, outbox drain, Twilio send, company purge stages |

---

## Falsas oportunidades (explícitas)

1. **Trigger para enviar WhatsApp de recibo** → NO; outbox + job ya existe.  
2. **SP para check-in completo** → NO; duplicaría geofence/sesión/Twilio.  
3. **Trigger anti-solape ausencias** → NO; preferir locking.  
4. **Trigger de auditoría global** → NO por defecto; costo/ruido.  
5. **Cascade trigger en delete empresa** → NO; lifecycle staged + jobs ya modelados.  
6. **HTTP / email / GCS desde SQL** → prohibido.

---

## Evidencia de objetos SQL “avanzados”

```text
Triggers:     1  (TR_employees_category_company_scope)
Procedures:   0
Functions:    1  (fn_resolve_operation_timezone_for_sql)
ROWVERSION:   0
ON DELETE *:  0 en DDL
```

El proyecto ya practica el principio correcto en muchos dominios: **Constraint > Trigger**, **Outbox > side-effect in SQL**, **App transaction + UPDLOCK** para atomicidad. El trabajo pendiente es **cerrar gaps P1 con constraints/locking**, no adoptar triggers/SPs de forma generalizada.

---

*Fin del audit. Próximo paso sugerido: implementar Fase 0 ítems H1–H4 en un stage dedicado con tests de concurrencia SQL Server.*
