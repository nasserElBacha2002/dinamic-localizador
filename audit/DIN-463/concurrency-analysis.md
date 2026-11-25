# DIN-463 — Análisis de concurrencia e integridad

---

## 1. Estado actual (CONFIRMED)

### 1.1 Altas de empleados

- `employeeService.create` abre transacción (`employee.service.ts:76-78`), inserta vía `employeeRepository.create`.
- **No** adquiere `sp_getapplock` a nivel empresa.
- Precheck `findByPhone` ocurre **antes** de la transacción (L64-67) — ventana TOCTOU para teléfono, independiente de cupos.
- Locks SQL en insert: `UPDLOCK, HOLDLOCK` sobre categoría y zona (`employee.repository.ts:131-149`), no sobre conteo de empleados.

### 1.2 Desactivación / reactivación

- `employeeDeactivationRepository.lockEmployeeForUpdate` usa `employees WITH (UPDLOCK, HOLDLOCK, ROWLOCK)` (`employee-deactivation.repository.ts:27-38`) — serializa mutaciones **del mismo empleado**, no el cupo global.
- Reactivación vía `employeeService.update` usa lock de fila solo si hay operational charge holder (`companyUserEmployeeLinkLockResource`, L236-239).

### 1.3 Billing contractual (DIN-406)

- Escrituras de suscripción/términos: `acquireTransactionAppLock(..., billingSubscriptionCompanyLockResource(companyId))` en `billing-subscription.service.ts` (~L533, L831, L1014).
- **CONFIRMED:** patrón de serialización por empresa ya existe para contratos, no para headcount.

### 1.4 Precedente: cupos WhatsApp

- `whatsappUsageQuotaRepository.admitTurnAtomic` — transacción + `UPDLOCK` en filas contador + test “dos conexiones disputan el último turno” (`whatsapp-usage-quota.concurrency.integration.test.ts:23+`).
- Modo efectivo conservador: ENFORCE solo si global y empresa ENFORCE (`whatsapp-usage-quota.service.ts:74-81`).

---

## 2. Escenario adversarial: dos altas, último cupo

**Setup:** `seat_max = N`, empleados activos contables = `N-1`, dos requests concurrentes `POST /employees`.

| Paso | Tx A | Tx B |
|------|------|------|
| 1 | BEGIN | BEGIN |
| 2 | `COUNT(active)=N-1` → admitir | `COUNT(active)=N-1` → admitir |
| 3 | INSERT empleado | INSERT empleado |
| 4 | COMMIT (`N` activos) | COMMIT (`N+1` activos) |

**Clasificación:** **PROBABLE** hoy; **CONFIRMED** que no hay constraint DB que limite filas activas por empresa.

**NOT_VERIFIABLE:** definición exacta de COUNT hasta fijar regla de conteo.

---

## 3. Escenario: reactivación + alta concurrentes

Misma condición de carrera entre:

- `update(..., { active: true })` en empleado inactivo
- `create` o import batch

Requiere el mismo guard serializado por empresa.

---

## 4. Importación masiva

| Modo | Comportamiento | Riesgo cupo |
|------|----------------|-------------|
| `createManyForImport` éxito | Un COMMIT para todo el chunk | Una sola decisión de cupo debe validar `delta = chunk.length` |
| Fallback fila a fila | Varios COMMIT | **PROBABLE:** superar cupo en filas tardías del mismo archivo |

**CONFIRMED:** chunk size configurable (`IMPORT_PERSIST_CHUNK_SIZE`).

---

## 5. Operaciones parciales y fallos DB

- Fallo post-INSERT pre-COMMIT: rollback estándar — no consume cupo persistido.
- Fallo en `initializeEmployeeAbsenceBalances`: rollback en `create` — **CONFIRMED** (`employee.service.ts:114-115`).
- ENFORCE: si el guard falla con deadlock (`APP_LOCK_DEADLOCK`), cliente debe reintentar — patrón existente en `sql-app-lock.ts:61-66`.

---

## 6. Nivel de aislamiento y restricciones DB

- Driver `mssql`: aislamiento por defecto READ COMMITTED (típico SQL Server).
- **CONFIRMED:** no hay trigger/CK en `employees` que relacione `active` con `billing_subscription_terms.seat_max`.
- Unicidad relevante: `UQ_employees_company_phone_number` (`015_multi_company_foundation.sql`) — no limita cantidad.

---

## 7. Mecanismo recomendado (diseño mínimo)

### Opción A — Lock + COUNT (recomendada para v1)

Dentro de la **misma transacción** que el INSERT/UPDATE de empleado:

1. `acquireTransactionAppLock(tx, { resource: commercialSeatCompanyLockResource(companyId) })` — nuevo helper junto a `billingSubscriptionCompanyLockResource` en `sql-app-lock.ts`.
2. Resolver `seatMax` y modo (DISABLED → return; OBSERVE → continuar sin reject).
3. `SELECT COUNT(*) ... WITH (UPDLOCK, HOLDLOCK)` sobre conjunto contable (p. ej. `employees WHERE company_id = @id AND active = 1`) — **sujeto a decisión de conteo**.
4. Si `count + delta > seatMax` y ENFORCE → `ROLLBACK` + `409 COMMERCIAL_SEAT_LIMIT_EXCEEDED`.
5. Si OBSERVE → INSERT observación + continuar.
6. COMMIT.

**Ventajas:** sin nueva tabla contador; coherente con locks existentes.  
**Coste:** serializa todas las mutaciones de cupo por empresa (aceptable para CRM típico).

### Opción B — Contador materializado

Tabla `billing_company_seat_usage (company_id, active_count)` actualizada en misma TX con `UPDLOCK` en fila única.

**Ventajas:** lectura rápida para UI.  
**Riesgos:** drift si hay bypass SQL; requiere reconciliación.

### Opción C — CHECK constraint / trigger

**No recomendado** en v1: regla depende de término contractual temporal y exenciones; lógica compleja en trigger.

### Deadlock con suscripción

Si una TX administra suscripción y otra crea empleado:

- **Orden fijo global:** p. ej. siempre `billing-subscription:{companyId}` antes de `commercial-seat:{companyId}`, o recursos distintos sin anidamiento cruzado.
- **PROBABLE:** admin billing + alta concurrente es raro; documentar en implementación.

---

## 8. Idempotencia

- Reintentos HTTP de `create` con mismo teléfono: **CONFIRMED** 409 `EMPLOYEE_PHONE_ALREADY_EXISTS` — no doble consumo.
- Reintentos tras `APP_LOCK_TIMEOUT`: cliente reintenta; guard debe ser determinista.
- Deactivate idempotente en inactivo: **CONFIRMED** test `employee-deactivation.integration.test.ts:301-311`.

---

## 9. Pruebas de concurrencia recomendadas

1. Ephemeral SQL: dos conexiones, `seat_max=1`, `count=0`, parallel `employeeService.create` → exactamente uno 201 y uno 409 (ENFORCE).
2. Mismo con modo OBSERVE → ambos 201 + 2 eventos observación.
3. Import chunk `delta=5` con `seat_max=3` → rechazo atómico del chunk (ENFORCE).
4. Reactivación + create concurrente en último cupo.
5. Empresa exenta: sin lock prolongado / sin rechazo.

Patrón de test: `whatsapp-usage-quota.concurrency.integration.test.ts`.