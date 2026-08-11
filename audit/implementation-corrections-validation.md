# Implementation corrections — Location-first WhatsApp attendance

**Fecha:** 2026-08-11  
**Estado:** `FIXED_AND_VALIDATED`  
**Alcance:** Correcciones incrementales sobre location-first attendance (timestamp, concurrencia, AMBIGUOUS_MIXED, module gates, tests SQL).

---

## 1. Causa raíz de cada corrección

| # | Hallazgo | Causa raíz | Corrección |
|---|----------|------------|------------|
| 1 | Timestamp de fichaje = hora de selección | `processLocationCheckIn/Checkout` usaban `getBotNow()` e ignoraban `pendingLocation.receivedAt` | `eventAt` opcional + `eligibilityAt` separado; selection pasa `resolvePendingLocationEventAt` |
| 2 | Concurrencia 2 MessageSid | Idempotencia MessageSid ≠ unicidad de fichaje | Constraints existentes (`UX_*_active*`, `UQ_*_source_message_sid`, CAS checkout); manejo de violación; test SQL `Promise.all` |
| 3 | Retry MessageSid → CHECK_OUT | Riesgo si claim ocurre después del intent | Invariante documentada: `claimInboundMessage` antes de intent; test claim + `UQ_source_message_sid` |
| 4 | AMBIGUOUS_MIXED pedía Llegué/Me voy | Rama especial sin `pendingLocation` | Prompt numerado + sesión `WAITING_OPERATION_SELECTION` con `attendanceAction` + reuso de ubicación |
| 5 | Revalidación vs momento del evento | Un solo `now` para ambas cosas | `eligibilityAt=now` (estado actual); `eventAt` (punctuality/persistencia) |
| 6 | Module gates bloqueaban checkout válido | MIXED usaba gate de check-in (OPERATIONS) | `applyCompanyModulesToLocationIntent`: ATTENDANCE bloquea todo; OPERATIONS solo quita check-in |
| 7 | `processDirectLocationAttendance` crecía | Lógica mezclada en bot service | Extraído a `direct-attendance-location.service.ts` |
| 8 | Código muerto | `LOCATION_WITHOUT_SESSION_MESSAGE` aún usada en router | Conservada (consumidor real); copy MIXED actualizada |
| 9 | Templates Twilio | Fuera de repo | Documentado como acción operativa |

**Migraciones:** ninguna (constraints ya suficientes).

---

## 2. Arquitectura final

```
Webhook
  → claimInboundMessage(MessageSid)   // ANTES de intención
  → route LOCATION sin sesión
  → processDirectLocationAttendance (direct-attendance-location.service)
       → list check-in + checkout candidates
       → resolveAttendanceLocationIntent()  // pura
       → applyCompanyModulesToLocationIntent()
       → AMBIGUOUS_* → session + pendingLocation
       → CHECK_IN/OUT → processLocationCheckIn/Checkout(eventAt)
Selection
  → revalidate estado actual (now)
  → processLocation*(eventAt=pending.receivedAt)
```

`resolveAttendanceLocationIntent` permanece pura. Sin factories/adapters.

---

## 3. Manejo de timestamp

- `PendingBotLocation.receivedAt` se persiste al recibir LOCATION.
- `processLocationCheckIn` / `processLocationCheckout` aceptan `eventAt?: Date`.
- Validación geofence/punctuality y filas `received_at` / `checkout_at` usan `eventAt`.
- `createAttendanceForEmployeeWorkday` acepta `eligibilityAt` para la ventana de elegibilidad (estado actual) mientras `receivedAt` es el evento de negocio.
- Flujos LOCATION directa, post-Llegué, post-Me voy y post-selección convergen en los mismos use cases.

---

## 4. Estrategia de idempotencia

1. `claimInboundMessage` → `IDEMPOTENT_REPLAY` / `IN_PROGRESS` corta retries antes del router.
2. `UQ_attendance_records_source_message_sid` impide doble insert con el mismo SID.
3. Comentario de invariante en `whatsapp-bot.service.ts` junto al claim.

---

## 5. Estrategia de concurrencia

- No locks globales / no TOCTOU-only `if`.
- Unicidad activa por workday (índices `UX_attendance_records_employee_workday_active_*` y legacy `UX_attendance_records_inventory_employee_active`).
- Checkout: `UPDATE … WHERE checkout_at IS NULL` (CAS).
- Violaciones → respuesta de duplicado / una sola fila final.
- Evidencia: `location-first-attendance-concurrency.integration.test.ts`.

---

## 6. Constraints DB verificadas

| Constraint / mecanismo | Protege |
|------------------------|---------|
| `UX_attendance_records_employee_workday_active_real` (+ simulation) | Un check-in activo real por workday |
| `UX_attendance_records_inventory_employee_active` (legacy, aún presente en DB) | Unicidad por operation+employee |
| `UQ_attendance_records_source_message_sid` | Mismo MessageSid de llegada |
| `registerCheckoutInTransaction` CAS | Un solo checkout |
| Unique active bot session (histórico) | Una sesión activa por teléfono/empleado |

---

## 7. Comportamiento AMBIGUOUS_MIXED

Antes: pedía escribir Llegué/Me voy y nueva ubicación.  
Ahora:

1. Guarda `pendingLocation` + opciones con `attendanceAction`.
2. Prompt: “Registrar salida / Registrar llegada” numerado.
3. Selección → revalida → reutiliza coords; no pide segunda LOCATION.
4. `selectCheckoutOperationAndRenewExpiration` acepta también `WAITING_OPERATION_SELECTION` (mixed).

---

## 8. Tests de integración SQL

Archivo: `backend/src/services/location-first-attendance-concurrency.integration.test.ts`

| Test | Resultado |
|------|-----------|
| 2 MessageSid concurrent → 1 check-in, `checkout_at` NULL | pass |
| claim MessageSid retry → `IDEMPOTENT_REPLAY` | pass |
| duplicate `source_message_sid` | pass |
| concurrent checkouts → un `checkout_at` | pass |

Comando (exit 0):

```bash
EMAIL_TRANSPORT=console RUN_DB_INTEGRATION_TESTS=true \
  npx tsx --import ./src/test-helpers/preload-test-env.ts \
  --test --test-concurrency=1 --test-force-exit \
  src/services/location-first-attendance-concurrency.integration.test.ts
```

`# tests 4 / pass 4 / fail 0`

---

## 9. Resultados build / lint / tests

| Comando | Exit | Detalle |
|---------|------|---------|
| `cd backend && npm run build` | 0 | tsc OK |
| `npx eslint` (archivos tocados de esta corrección) | 0 | limpio |
| `cd backend && npm run lint` | 0* | suite completa reporta errores **preexistentes** fuera de alcance (~58); archivos de esta corrección limpios |
| `cd backend && npm test` | 0 | **1250 pass / 0 fail** |
| unit location-first focused | 0 | **16 pass** |
| SQL concurrency (arriba) | 0 | **4 pass** |

\* No se afirma que el repo completo esté libre de deuda de lint histórica.

---

## 10. Migraciones

**Ninguna.** Las constraints existentes cubren las invariantes.

---

## 11. Riesgos pendientes

- DB aún puede tener índice legacy `UX_attendance_records_inventory_employee_active` además del workday-scoped; ambos protegen, pero el nombre en errores varía (tests aceptan ambos).
- Templates Twilio Content siguen siendo rollout operativo (no versionados aquí).
- Cobertura E2E webhook completo para “LOCATION 09:00 → selección 09:07 → `received_at` 09:00” es unitaria + wiring; no hay test SQL end-to-end del bot completo con clock mock (riesgo residual bajo: wiring `eventAt` verificado en código y punctuality unit).

---

## 12. Acciones operativas — Twilio Content Templates

Actualizar en Twilio Console (fuera del código) los templates aprobados:

- `TWILIO_ARRIVAL_*`
- `TWILIO_EXIT_*`
- `TWILIO_TEMPLATE_NO_CHECKIN_*`
- equivalentes de salida / recordatorios

para **dejar de exigir** “Llegué” / “Me voy” como paso obligatorio. Los comandos siguen soportados en el bot in-session; no son mandatorios para fichar con LOCATION.

No modificar recursos externos desde el código de la app.
