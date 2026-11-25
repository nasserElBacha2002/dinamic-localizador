# DIN-463 — Audit report (pre-implementación)

**Fecha:** 2025-11-25  
**Alcance:** Control de cupos comerciales por empresa (DIN-406 Fase 3)  
**Metodología:** Solo evidencia de código y SQL (sin implementar).

---

## Estado ejecutivo

| Campo | Valor |
|-------|--------|
| **Status** | `NEEDS_CLARIFICATION` |
| **Preparación técnica** | Alta: modelo contractual DIN-406, transacciones, `sp_getapplock`, precedente WhatsApp quotas |
| **Bloqueos** | Reglas de conteo de colaboradores, empresas sin suscripción vigente, política OBSERVE vs datos legacy |

---

## Resumen de hallazgos

1. **CONFIRMED — No existe enforcement operacional de cupos hoy.** `billingPolicyService` expone `enforceSeatLimit`, pero ningún flujo de alta/reactivación/importación lo consulta (`billing-policy.integration.test.ts` documenta “sin bloqueos operativos”).
2. **CONFIRMED — Capacidad contractual vive en DIN-406.** `billing_subscriptions` + `billing_subscription_terms.seat_min` / `seat_max`; vigencia vía `findVigentByCompanyId` y `findActiveAt`; `seat_max IS NULL` ⇒ ilimitado (convención `tier-seat-range.ts`).
3. **CONFIRMED — Empresas ilimitadas:** exención estratégica (UUID en código) + filas `billing_company_exemptions` ⇒ `isExempt` y `enforceSeatLimit: false` (`billing-policy.service.ts`).
4. **CONFIRMED — Rutas productivas de incremento de cupo:** `employeeService.create`, `createManyForImport`, reactivación vía `employeeService.update` (`active: true`), import masivo (`employees.strategy.ts`); decremento vía `employeeDeactivationService.deactivate` (no vía `update(active:false)`).
5. **PROBABLE — Race en el último cupo:** altas concurrentes por empresa no usan `sp_getapplock` ni contador atómico; solo validaciones intra-transacción de categoría/zona.
6. **CONFIRMED — Bypass no-API:** `backend/src/scripts/seed-employees.ts` hace `MERGE` directo a `employees` (reactiva `active = 1`).
7. **NOT_VERIFIABLE — Qué filas “consumen cupo”:** el repo no define regla de negocio (p. ej. solo `active = 1` vs todos los registros).

---

## Hallazgos por severidad

### Crítico

| ID | Severidad | Clasificación | Hallazgo |
|----|-----------|---------------|----------|
| H-01 | Crítico | CONFIRMED | Sin punto de enforcement centralizado en rutas de empleados. |
| H-02 | Crítico | PROBABLE | Dos altas simultáneas pueden superar `seat_max` sin mecanismo serializador por empresa. |

### Alto

| ID | Severidad | Clasificación | Hallazgo |
|----|-----------|---------------|----------|
| H-03 | Alto | CONFIRMED | Reactivación no tiene endpoint dedicado; `PUT /employees/:id` con `active: true` puede aumentar cupo sin pasar por desactivación asistida. |
| H-04 | Alto | CONFIRMED | Import masivo: chunk atómico en `createManyForImport`, pero fallback fila a fila en `employees.strategy.ts` permite resultados parciales. |
| H-05 | Alto | NOT_VERIFIABLE | Empresa con `enforceSeatLimit: true` y sin suscripción/termino vigente: no hay fuente de `seat_max` en código operativo. |

### Medio

| ID | Severidad | Clasificación | Hallazgo |
|----|-----------|---------------|----------|
| H-06 | Medio | CONFIRMED | `seed-employees.ts` evade capas de servicio y política comercial. |
| H-07 | Medio | CONFIRMED | Tests e integración insertan empleados con SQL directo (no afecta prod, sí invalida suposición “solo employeeService”). |
| H-08 | Medio | PROBABLE | Reutilizar `billingSubscriptionCompanyLockResource` para cupos + escrituras de suscripción en la misma empresa exige orden de locks documentado (riesgo deadlock). |

### Bajo

| ID | Severidad | Clasificación | Hallazgo |
|----|-----------|---------------|----------|
| H-09 | Bajo | CONFIRMED | `seat_min` contractual no se usa en conteo de colaboradores (solo validación al contratar). |
| H-10 | Bajo | CONFIRMED | `employee_type` (`fijo` / `eventual`) no participa en billing DIN-406. |

---

## Matriz de requisitos (extracto)

| Requisito DIN-463 | Status | Evidencia / brecha |
|-------------------|--------|-------------------|
| Contabilizar vs capacidad contractual vigente | GAP | Términos existen; conteo/enforcement ausente |
| Altas / reactivaciones / importación | OK (rutas identificadas) | `employee.service.ts`, `employees.strategy.ts` |
| Concurrencia segura último cupo | GAP | Sin lock/counter; ver WhatsApp `admitTurnAtomic` como referencia |
| DISABLED / OBSERVE / ENFORCE | GAP | No hay env/tabla; precedente `WHATSAPP_QUOTA_GLOBAL_MODE` + `company_settings.whatsapp_quota_mode` |
| Exenciones e ilimitados | OK | `billing-policy.service.ts`, `seat_max NULL` |
| ENFORCE off por defecto | OK (estado actual) | Nada aplica ENFORCE hoy |
| Sin cobros/suspensiones automáticas | OK | DIN-406 no acopla cobro a headcount en runtime |
| Aislamiento tenant | OK | Queries con `company_id` en repos |
| Sin DIN-464 | OK | Sin referencias en repo |

---

## Arquitectura recomendada (solo diseño)

- Servicio transversal bajo `backend/src/services/billing/` (p. ej. `commercial-seat-quota.service.ts`) invocado **solo** desde `employeeService` (create, createManyForImport, update cuando cambia consumo de cupo).
- Resolución de capacidad: `billingSubscriptionService.getCurrentSubscription` → `getCurrentTerms` → `seatMax`; cortocircuito si `billingPolicyService.getCompanyBillingPolicy` indica skip.
- Serialización: `sp_getapplock` con recurso dedicado `commercial-seat:${companyId}` (preferible a compartir lock de suscripción sin política de orden).
- Modos: env global default `DISABLED`; override por empresa; mapeo OBSERVE ≈ `SHADOW`; ENFORCE efectivo solo si global **y** empresa ENFORCE (patrón `resolveEffectiveQuotaMode` en `whatsapp-usage-quota.service.ts:74-81`).
- Observación: tabla de eventos append-only (empresa, modo, decisión, conteo, límite, actor) en OBSERVE/ENFORCE.

---

## Impactos

| Área | Impacto |
|------|---------|
| Database | Nueva migración: modo por empresa + opcional ledger; sin cambiar contratos DIN-406 |
| API | Posibles códigos 409 en ENFORCE; observabilidad en OBSERVE |
| Frontend | Mensajes al superar cupo (solo ENFORCE) |
| WhatsApp / Twilio | Ninguno |
| Deploy | Nueva variable de entorno; default DISABLED |

---

## Seguridad y compatibilidad

- **CONFIRMED:** Permisos `employees:manage` en rutas de mutación (`employee.routes.ts`).
- **CONFIRMED:** Config comercial admin ya restringida a platform admin (`billing-commercial.routes.ts`).
- **GAP:** Autorización para cambiar modo de cupos por empresa aún no diseñada (sugerencia: platform admin + auditoría).
- **CONFIRMED:** Desactivación no bloquea asistencias existentes; solo `active = false` en empleado.

---

## Recomendación final

El repositorio **está arquitectónicamente preparado** para una implementación mínima centralizada (DIN-406 + transacciones + locks existentes). **No** está listo para activar ENFORCE sin resolver decisiones en `open-decisions.md` y definir comportamiento con datos legacy por encima de `seat_max`.

**Siguiente comando sugerido:** `/implement-dinamic-stage` tras cerrar decisiones comerciales.