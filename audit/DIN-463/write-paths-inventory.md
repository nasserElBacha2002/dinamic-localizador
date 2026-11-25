# DIN-463 — Inventario de rutas que afectan cupos

Leyenda: **↑** incrementa consumo contable, **↓** decrementa, **~** sin cambio neto típico.

Clasificación: **CONFIRMED** (código demostrado), **PROBABLE**, **NOT_VERIFIABLE**.

---

## 1. API HTTP (producción)

| Ruta | Método | Permiso | Efecto cupo | Servicio | Evidencia |
|------|--------|---------|-------------|----------|-----------|
| `/api/companies/:companyId/employees` | POST | `employees:manage` | ↑ alta | `employeeService.create` | `employee.routes.ts:33-37`, `employee.controller.ts:13-16` |
| `/api/companies/:companyId/employees/:id` | PUT | `employees:manage` | ↑ si `active: true` en inactivo | `employeeService.update` | `employee.routes.ts:152-157`, `employee.service.ts:201-210` (bloquea solo `active: false`) |
| `/api/companies/:companyId/employees/:id/deactivate` | POST | `employees:manage` | ↓ | `employeeDeactivationService.deactivate` | `employee.routes.ts:113-118` |
| `/api/companies/:companyId/employees/:id` | DELETE | `employees:manage` | ↓ (legacy) | `deactivate` sin confirmación | `employee.controller.ts:156-165` |
| `/api/companies/:companyId/imports/employees/*` | * | import auth | ↑ (batch) | `employees.strategy` → `createManyForImport` / `create` | `import.routes.ts`, `employees.strategy.ts:413-474` |

**CONFIRMED:** No hay ruta dedicada de “reactivación”; `update` con `active: true` es camino válido.

---

## 2. Servicios de dominio

### 2.1 `employeeService` (`backend/src/services/employees/employee.service.ts`)

| Función | Líneas (aprox.) | Efecto | Transacción | Notas |
|---------|----------------|--------|-------------|-------|
| `create` | 57-122 | ↑ | Sí (`sql.Transaction`) | Precheck teléfono fuera de TX; sin lock por empresa |
| `createManyForImport` | 129-183 | ↑ (N) | Sí, chunk único | Rollback total del chunk si falla |
| `update` | 201-306 | ↑/↓ según `active` | Sí | Deactivación vía `active:false` rechazada (409) |

### 2.2 `employeeDeactivationService` (`employee-deactivation.service.ts`)

| Función | Efecto | CONFIRMED |
|---------|--------|-----------|
| `deactivate` | ↓ (`active: false`) | L118-273, `employeeRepository.update` con `active: false` |

### 2.3 Repositorio (`employee.repository.ts`)

| Función | Bypass de servicio | Uso prod |
|---------|-------------------|----------|
| `create` / `createMany` | Sí, si llamado directo | **CONFIRMED:** solo vía `employeeService` en app; tests/scripts llaman directo |
| `update` | Sí | Vía `employeeService` / deactivation |

Inserción default: tabla `employees` `active BIT DEFAULT 1` (`database/migrations/002_core_domain.sql:11`).

---

## 3. Importación masiva

**Archivo:** `backend/src/imports/strategies/employees.strategy.ts`

1. **Persistencia normal:** `employeeService.createManyForImport` — **CONFIRMED** atómico por chunk (`IMPORT_PERSIST_CHUNK_SIZE` en `imports/constants.ts`).
2. **Fallback:** Si falla el batch, iteración `employeeService.create` fila a fila (L426-471) — **PROBABLE** superación parcial de cupo bajo ENFORCE si no hay pre-check global por chunk.

Revalidación concurrency de teléfonos: L380-411 (no incluye cupo comercial).

---

## 4. Rutas que NO modifican cupo (verificado)

| Área | Motivo |
|------|--------|
| `employeeClientService.replaceForEmployee` | Solo relación cliente–empleado |
| `employeeOperationalAccessService.*` | Usuario panel ↔ empleado existente |
| `operationAssignmentService.assignEmployee` | Requiere empleado ya activo |
| `billing-subscription.service` / negotiated contract | Cambia `seat_max` contractual, no filas `employees` |
| Asistencia / WhatsApp bot | No crean empleados |

---

## 5. Procesos internos / scripts

| Script | Efecto | Evidencia | Riesgo evasión |
|--------|--------|-----------|----------------|
| `backend/src/scripts/seed-employees.ts` | ↑ / reactivación (`active = 1` en MERGE) | L63-77 | **CONFIRMED** alto (SQL directo, sin `company_id` en MERGE legacy) |
| `backend/src/scripts/historical-seed/*` | ↑ vía `employeeService.create` | grep en tests/seed | Medio (usa servicio) |
| Seeds de integración / SQL en tests | ↑ | Múltiples `INSERT INTO employees` | N/A prod |

---

## 6. Caminos alternativos (evasión de control centralizado)

| Camino | Clasificación | Mitigación propuesta |
|--------|---------------|----------------------|
| Llamada directa `employeeRepository.create*` desde código nuevo | PROBABLE | Guard test / allowlist; enforcement solo en `employeeService` |
| SQL manual / scripts ops | CONFIRMED | Documentar break-glass; no bloquear en v1 o auditar |
| `PUT` reactivación sin flujo asistido | CONFIRMED | Incluir en mismo guard que `create` |
| Import fallback fila a fila | CONFIRMED | Pre-admission por chunk bajo lock |
| Platform crear empresa + empleados sin suscripción | NOT_VERIFIABLE | Definir política sin contrato (ver `open-decisions.md`) |

---

## 7. Mapa de integración propuesto (DIN-463)

Puntos de enganche mínimos (**CONFIRMED** como únicos writers productivos):

```
employeeService.create
employeeService.createManyForImport  (antes de INSERT; 1 lock por chunk)
employeeService.update               (si inactive→active)
employeeDeactivationService.deactivate (libera cupo si aplica)
```

No enganchar: attendance, operations, billing admin, WhatsApp.