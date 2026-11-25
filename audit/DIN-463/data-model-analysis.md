# DIN-463 — Modelo contractual y contabilización

---

## 1. Entidades y tablas

### 1.1 Empresa

| Tabla | Campos relevantes | Migración |
|-------|-------------------|-----------|
| `companies` | `id`, `status`, `name` | Multi-tenant foundation |

### 1.2 Colaborador (empleado)

| Tabla | Campos relevantes | Notas |
|-------|-------------------|-------|
| `employees` | `company_id`, `active` (default 1), `employee_type`, `phone_number` | `002_core_domain.sql`; phone único por empresa `UQ_employees_company_phone_number` |

**CONFIRMED:** `employees` es el modelo técnico de colaborador (`employee.repository.ts:1-2`).

### 1.3 Contrato comercial (DIN-406)

| Tabla | Propósito |
|-------|-----------|
| `billing_plans` / `billing_plan_tiers` | Catálogo; tier con `seat_min`, `seat_max` |
| `billing_subscriptions` | Suscripción por empresa; estados `SCHEDULED`, `ACTIVE`, `ENDED`, `CANCELLED` |
| `billing_subscription_terms` | Términos inmutables; **`seat_min`, `seat_max`** acordados |
| `billing_company_exemptions` | Exención permanente persistida |

Migración base: `160_billing_subscriptions.sql` (L117-118 `seat_min`, `seat_max`).

Índices relevantes:

- `UX_billing_subscriptions_company_active` — una ACTIVE por empresa.
- `UX_bst_subscription_open_term` — un término abierto (`effective_to IS NULL`) por suscripción.

---

## 2. Capacidad contractual vigente (CONFIRMED)

### 2.1 Suscripción en vigor

`billingSubscriptionRepository.findVigentByCompanyId` (`billing-subscription.repository.ts:86-104`):

- Estados `ACTIVE` o `SCHEDULED` en ventana `[effective_from, effective_to)`.
- Prefiere `ACTIVE` sobre `SCHEDULED`.

### 2.2 Término vigente

`billingSubscriptionTermRepository.findActiveAt` (`billing-subscription-term.repository.ts:109-126`):

- `effective_from <= @at < effective_to` (o `effective_to IS NULL`).
- `cancelled_at IS NULL`.
- Orden `effective_from DESC`.

### 2.3 Capacidad numérica

- **`seat_max`:** límite superior acordado; **`NULL` = ilimitado** (convención código: `seatRangeEnd` en `tier-seat-range.ts:1-3` usa `Number.MAX_SAFE_INTEGER` solo para comparación de rangos, no para enforcement).
- **`seat_min`:** mínimo contractual; usado al crear términos (`assertSeatCapacity` en `catalog-input.ts:16-27`); **CONFIRMED:** no usado para contar empleados hoy.

### 2.4 Empresas sin catálogo estándar

- Plan `CUSTOM`: `assertCompatibleSubscriptionContractTerms` retorna temprano (`billing-subscription-contract-policy.service.ts:105-107`) — capacidad viene del término negociado, no del tier público.

---

## 3. Política comercial por empresa (CONFIRMED)

`billingPolicyService.getCompanyBillingPolicy` (`billing-policy.service.ts:33-51`):

| Origen | `isExempt` | `enforceSeatLimit` |
|--------|------------|-------------------|
| UUID estratégico (`PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS`) | true | false |
| Fila abierta `billing_company_exemptions` | true | false |
| Default | false | true |

Comentario en tipo: *“not operationally enforced in Fase 1C”* (`types/billing-company-exemption.ts:21-22`).

**CONFIRMED:** `enforceSeatLimit: true` es expectativa comercial, **no** enforcement runtime sobre `employees`.

---

## 4. Qué estados consumen cupo

| Regla | Evidencia en repo |
|-------|-------------------|
| Solo `active = 1` | **NOT_VERIFIABLE** como regla de negocio; uso operativo widespread (asignaciones rechazan inactivos) |
| Inactivos no consumen | **PROBABLE** por `operation-assignment.service.ts:272-273` |
| Registros huérfanos / sin company | Impedido por schema |
| `employee_type` eventual vs fijo | **CONFIRMED:** no distinción en billing |

**Inconsistencia legacy:** empresa puede tener más empleados `active=1` que `seat_max` contractual — **PROBABLE** en producción hasta implementar control; DIN-463 no debe suspender automáticamente (requisito usuario).

---

## 5. Ilimitados y excepciones

| Caso | Representación |
|------|----------------|
| Estratégicas | UUID hardcoded + opcional fila SQL (`constants/billing-company-exemption.ts:13-32`) |
| Exención admin | `billing_company_exemptions` permanente |
| Contrato | `seat_max IS NULL` en término |
| Política | `enforceSeatLimit: false` cuando `isExempt` |

Launch plan público referencia 100 asientos (`BILLING_LAUNCH_INCLUDED_SEAT_MAX`, `billing-launch-plan.ts:14`) — **CONFIRMED** solo catálogo; no auto-aplica a empresas sin suscripción.

---

## 6. Relaciones e integridad

- FK compuestas `(company_id, id)` en muchas tablas hijas de `employees` (migraciones 084+).
- Billing FK `billing_subscriptions.company_id → companies`.
- **GAP:** ninguna FK entre `employees` y `billing_subscription_terms`.

---

## 7. Inconsistencias contractuales vs colaboradores

| Situación | Clasificación | Nota implementación |
|-----------|---------------|----------------------|
| Más activos que `seat_max` | PROBABLE en datos existentes | ENFORCE bloquea **nuevas** altas/reactivaciones; OBSERVE registra |
| Sin suscripción, `enforceSeatLimit: true` | CONFIRMED posible (`billing-policy.integration.test.ts:110-120`) | Requiere decisión (ver open-decisions) |
| `SCHEDULED` subscription futura | CONFIRMED vigente en `findVigentByCompanyId` | ¿Cupos aplican ya? NOT_VERIFIABLE |
| Cambio de `seat_max` en nuevo término | CONFIRMED vía versiones | Conteo instantáneo vs fecha efectiva del término |

---

## 8. Resolución propuesta de límite (para implementación)

Pseudoflujo **sin** asumir reglas no confirmadas:

```
policy = getCompanyBillingPolicy(companyId)
if policy.isExempt || !policy.enforceSeatLimit → skip (DISABLED comercial)
if effectiveMode === DISABLED → skip
subscription = getCurrentSubscription(companyId, now)
if !subscription → ???  // open decision
term = getCurrentTerms(subscription.id, now)
if !term → ???  // open decision
limit = term.seatMax  // null → unlimited
if limit === null → skip reject
count = countBillableEmployees(companyId)  // definición pendiente
```