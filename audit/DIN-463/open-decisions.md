# DIN-463 — Decisiones (cerradas en implementación)

**Fecha cierre:** 2025-11-25

## OD-1 — Contabilización (CERRADA)

- Cada colaborador con `employees.active = 1` consume un cupo.
- Inactivos no consumen cupo.
- Independiente de asistencia, asignaciones u operaciones.
- Inactivo → activo consume 1 cupo; activo → inactivo libera 1 cupo.
- Updates sin cambio neto de activos no evalúan cupo.
- Reactivación idempotente (ya activo) no consume cupo adicional.
- Importaciones evalúan incremento neto de activos (lote atómico: `delta = inputs.length`).

**Implementación:** `employee.repository.countActiveInTransaction`, hooks en `employee.service.ts`.

## OD-2 — Capacidad contractual (CERRADA)

- Fuente única: `billingPolicyService`, `getCurrentSubscription`, `getCurrentTerms`, `seat_max`.
- `seat_max NULL` ⇒ ilimitado operacionalmente.
- `seat_min` no es tope operacional.
- Exenciones / `enforceSeatLimit = false` omiten control.
- Sin suscripción o sin término vigente: **permitir operación**, registrar `INCONSISTENCY` (`NO_VIGENT_SUBSCRIPTION` / `NO_VIGENT_TERM`).
- Error técnico de resolución en **ENFORCE**: bloquear con `COMMERCIAL_SEAT_CAPACITY_EVALUATION_FAILED`.
- Excedente legacy: solo bloquear **nuevos** incrementos en ENFORCE; sin suspensiones ni desactivaciones automáticas.

**Implementación:** `commercial-seat-quota.service.ts` → `resolveCapacity`.

## OD-3 — Suscripción SCHEDULED (CERRADA)

- Se mantiene semántica existente de `findVigentByCompanyId` (ACTIVE o SCHEDULED en ventana).
- El cupo contractual aplica cuando la suscripción está vigente según ese helper.

## OD-4 — Excedente legacy (CERRADA)

- Confirmado: ENFORCE rechaza solo incrementos; no mutaciones correctivas sobre empleados existentes.

## OD-5 — seat_min (CERRADA)

- Sin efecto en conteo operacional (solo validación contractual existente DIN-406).

## OD-6 — Nombres de modo (CERRADA)

- Dominio comercial: `DISABLED` | `OBSERVE` | `ENFORCE`.
- Global: `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE` (default `DISABLED`).
- Empresa: `company_settings.commercial_seat_quota_mode` nullable (sin configuración).

## OD-7 — Lock (CERRADA)

- Recurso dedicado `commercial-seat:{companyId}` (`sql-app-lock.ts`).
- Orden en update de empleado: link lock → employee row lock → commercial seat lock.

## OD-8 — Scripts (CERRADA)

- Seed TSV de colaboradores: usar importación/API (`employeeService`); el script `seed-employees` fue retirado (bypass de política en proceso independiente).
- Escrituras SQL directas fuera de servicios **no** tienen garantía universal (documentado en implementación).

## OD-9 — Autorización configuración (CERRADA)

- Lectura/escritura de modo por empresa solo vía `/api/platform/billing/.../commercial-seat-quota-settings` (platform admin).

## OD-10 — Timezone contractual (CERRADA)

- Evaluación de vigencia contractual a instante UTC (`new Date()`), alineado a billing existente.

## Pendiente explícito (fuera de OD)

- Activación ENFORCE en producción: requiere aprobación operativa (no activada en este entregable).