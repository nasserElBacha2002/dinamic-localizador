# DIN-463 — Plan mínimo de implementación

Principio: **centralizado, transaccional, default sin ENFORCE**, sin acoplar DIN-464.

---

## Subfase 0 — Decisiones y especificación (bloqueante)

- Cerrar ítems en `open-decisions.md`.
- Aprobar explícitamente activación de ENFORCE (fuera de código).

**Entregable:** ADR corto o ticket firmado por producto/comercial.

---

## Subfase 1 — Modelo de configuración y observación

### Migración (ej. `175_commercial_seat_quota_settings.sql`)

- Columna en `company_settings`: `commercial_seat_quota_mode` `CHECK (DISABLED, OBSERVE, ENFORCE)` default `DISABLED`.
- Tabla opcional `commercial_seat_quota_events` (append-only): `company_id`, `occurred_at`, `mode_effective`, `decision`, `active_count`, `seat_max`, `delta`, `source`, `actor_user_id`, `correlation_id`.

### Config

- `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE` en `env.ts`, default `DISABLED`; validación estricta; **nunca** ENFORCE por defecto en `docker-compose`.
- Función `resolveEffectiveCommercialSeatMode(global, company)` — copiar semántica conservadora de WhatsApp (`resolveEffectiveQuotaMode`: ENFORCE solo si ambos ENFORCE).

### Servicio

- `commercial-seat-quota.service.ts`:
  - `resolveCapacity(companyId, at)` → `{ unlimited, seatMax, subscriptionId, termId }`
  - `assertAdmissionInTransaction(tx, { companyId, delta, source, actorUserId })`
  - `recordObservation(...)` en OBSERVE

**Pruebas:** unit de resolución de modo; migración integration test.

---

## Subfase 2 — Enforcement hooks (OBSERVE + ENFORCE code path, ENFORCE off en prod)

### Código

1. `sql-app-lock.ts`: `commercialSeatCompanyLockResource(companyId)`.
2. `employee.service.ts`:
   - Antes de insert/update que **aumente** consumo: llamar `assertAdmissionInTransaction` con `delta` (+1 o +chunkSize).
   - En `update`: detectar `wasActive === false && willBeActive === true`.
   - En `deactivate`: **opcional** v1 no rechaza; cupo se libera por conteo (no decremento explícito).
3. `createManyForImport`: un solo check `delta = inputs.length` bajo lock.
4. Import strategy: en fallback fila a fila, cada `create` ya pasa por hook.

### Errores

- `409 COMMERCIAL_SEAT_LIMIT_EXCEEDED` (español, sin datos sensibles).
- OBSERVE: mismo flujo HTTP 201 + evento.

**Pruebas:**

- Unit con mocks de policy/capacity.
- Ephemeral integration: paralelo último cupo (ver `concurrency-analysis.md`).

---

## Subfase 3 — UI / API observabilidad (opcional mínimo)

- Platform admin: lectura de modo + shadow summary (contar eventos OBSERVE últimos N días).
- Endpoint company-scoped **solo lectura** para admins: uso vs cupo (sin exponer contrato de otros tenants).

**No incluir:** cobro, cambio automático de contrato, suspensión de empleados.

---

## Subfase 4 — Hardening y break-glass

- Documentar que `seed-employees.ts` evade política.
- Job opcional de **reconciliación** read-only: lista empresas `count > seat_max` (reporte, no mutación).
- Guard test: `employeeRepository.create` no invocado desde `services/` fuera de `employee.service` (allowlist tests/scripts).

---

## Subfase 5 — Activación ENFORCE (gated)

- Requiere checklist: migración aplicada, OBSERVE estable, decisiones cerradas, aprobación explícita.
- Cambio de env `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE=ENFORCE` + empresas piloto en ENFORCE.
- Rollback: global → DISABLED (efectivo OFF para todas si global OFF).

---

## Archivos tocados (estimación)

| Área | Archivos |
|------|----------|
| Migración | `database/migrations/175_*.sql`, rollback |
| Config | `backend/src/config/env.ts`, `.env.example`, `docker-compose*.yml` |
| Billing | `commercial-seat-quota.service.ts`, tests |
| Employees | `employee.service.ts`, posiblemente `employee-deactivation.service.ts` (solo si libera con reglas especiales) |
| Utils | `sql-app-lock.ts` |
| Docs | breve sección en README billing interno |

---

## Pruebas mínimas antes de merge

1. `npm test` backend (unit + integration ephemeral si aplica).
2. Casos: exenta, `seat_max` null, sin suscripción (según decisión), import chunk, reactivación, DISABLED default.
3. Concurrencia último cupo ENFORCE.

---

## Fuera de alcance (DIN-463)

- Facturación automática / ajuste de `agreed_amount`.
- Suspender empleados o bloquear asistencia.
- Modificar `seat_max` por conteo.
- DIN-464.