# Implementation corrections — attendance confirmation correlation

## Root cause de cada corrección

1. **PENDING histórico capturaba `"1"`/`"2"`** — `findConfirmationReplyTarget` leía reminders SENT históricos y elegía en Node sin filtrar ventana abierta ni versión vigente. Un PENDING pasado podía producir `CONFIRMATION_EXPIRED` o interceptar menús.
2. **Sin correlación por `scheduleVersion`** — un reminder V1 podía confirmar silenciosamente la asignación reprogramada (V2).
3. **Operaciones CANCELLED/COMPLETED no excluidas por status** — solo `cancelled_at` en assignment era insuficiente.
4. **Historial ilimitado** — múltiples filas históricas + `rows.find` en Node.
5. **Sesión bot hasta `scheduledStart`** — monopolizaba la sesión conversacional singleton durante horas; el TTL de negocio no pertenece a `bot_sessions`.
6. **Router catch-all temprano** — durable `"1"`/`"2"` podía robar intents (Llegué / Me voy) y menús.
7. **Estados finales flippeables** — CAS no restringía a `PENDING`; CONFIRMED ↔ UNAVAILABLE podía cambiar.
8. **Test de correlación duplicado** — `pickConfirmationReplyTarget` en unit test no ejercitaba SQL.
9. **Logs incorrectos** — `ATTENDANCE_CONFIRMATION_REMINDER_SENT_CONTEXT` antes de Twilio; `assignmentId: undefined`.
10. **Suite adminAlert** — fallo previo reportado; en esta corrida pasó aislado (5×) y en suite completa.

## Regla final de correlación

Candidato válido (ventana abierta, default `onlyExpired=false`):

```text
wan.status = SENT
wan.notification_type = ATTENDANCE_CONFIRMATION_REMINDER
wan.schedule_version = ie.confirmation_schedule_version
ie.cancelled_at IS NULL
i.operation_kind = ONE_TIME
i.status NOT IN (CANCELLED, COMPLETED)
i.scheduled_start > @now
ie.confirmation_status IN (PENDING, CONFIRMED, UNAVAILABLE)
```

Prioridad SQL `TOP 1`: PENDING → CONFIRMED → UNAVAILABLE, luego `sent_at DESC`, `scheduled_start ASC`.

## Regla de scheduleVersion

```text
notification.schedule_version == assignment.confirmation_schedule_version
```

Reminder de versión vieja **nunca** confirma la programación nueva.

## Regla sobre PENDING históricos

Open-window query exige `scheduled_start > now`. Un PENDING con start pasado **no** es target abierto.

`onlyExpired=true` (PENDING + `scheduled_start <= now`) **solo** se usa cuando hay sesión reciente EXPIRADA con contexto `attendanceConfirmation` — no como catch-all histórico.

## Regla de CONFIRMATION_EXPIRED

Significa: existía confirmación concreta y relevante (versión vigente + contexto de sesión de confirmación expirada) pero `now >= scheduledStart`.

No significa: “alguna vez hubo un PENDING vencido en la historia del empleado”.

`CONFIRMATION_EXPIRED` ≠ `SESSION_EXPIRED`.

## Arquitectura final de bot session vs durable state

| Concern | Source of truth |
|--------|-----------------|
| Business confirmation lifetime | `whatsapp_attendance_notifications` + `operation_assignments` + `scheduled_operations.scheduled_start` + scheduleVersion |
| Conversation session | `BOT_SESSION_TTL_MINUTES` via `buildExpiresAt()` |

`WAITING_ATTENDANCE_CONFIRMATION_RESPONSE` usa TTL conversacional corto; `validUntil` (= scheduledStart) vive en `contextJson` para expiración de negocio / `CONFIRMATION_EXPIRED`.

Durable resolver funciona **sin** sesión activa (reinicio / TTL conversacional vencido) mientras `now < scheduledStart` y versión vigente.

## Máquina de estados CONFIRMED/UNAVAILABLE

```text
PENDING + 1 → CONFIRMED (CAS onlyIfStatusIn=["PENDING"])
PENDING + 2 → UNAVAILABLE (CAS onlyIfStatusIn=["PENDING"])
CONFIRMED + 1 → idempotente (sin UPDATE)
CONFIRMED + 2 → no flip; responde mensaje CONFIRMED
UNAVAILABLE + 2 → idempotente
UNAVAILABLE + 1 → no flip; responde mensaje UNAVAILABLE
```

## Estrategia de concurrencia

`updateConfirmationStatus` CAS real:

```sql
AND confirmation_status IN (@expectedStatus…)
```

solo desde `PENDING`. Perdedor relee estado durable y responde el mensaje del ganador (determinista; sin lock explícito).

## SQL final

Ver `attendanceNotificationRepository.findConfirmationReplyTarget` — filtros arriba + `TOP 1` con ORDER BY de prioridad.

## Índices / migraciones

Ninguna migración nueva. Reutiliza columnas existentes (`confirmation_schedule_version`, `schedule_version`, `scheduled_start`, statuses).

## Tests unitarios

| Área | Resultado |
|------|-----------|
| attendance-confirmation-validity | pass |
| attendance-confirmation-response.handler | pass |
| employee-workday (finales + CAS + concurrencia 1v1/1v2/2v1) | pass |
| whatsapp-router (durable 1/2, Llegué, Me voy, menú, histórico, location, SESSION_EXPIRED) | pass |
| attendance-reminder | pass |
| Conjunto específico (131 tests) | **131 pass / 0 fail** |

## Tests de integración

`RUN_DB_INTEGRATION_TESTS=true` → `attendance-confirmation-reply-target.integration.test.ts`

Cases A–I: **8 pass / 0 fail** (SQL Server real, repository sin mock).

Durabilidad sin sesión: **garantizado por diseño** + verificado en unit (handler durable) y correlación SQL; no se simuló restart de proceso completo.

## Resultados de lint

`cd backend && npm run lint` → **pass**

## Resultado de build

`cd backend && npm run build` → **pass**

## Resultado de suite completa

`cd backend && npm test` → **1583 pass / 0 fail**

`adminAlertService` / `enqueues for multiple recipients…`:

- Aislado 5×: 7/7 pass cada vez
- En suite completa: pass
- Evidencia: no reproducible el fallo reportado anteriormente en este entorno; no se clasifica como “flaky” sin más datos.

## Riesgos residuales

- Con dos PENDING abiertas, gana la de `sent_at` más reciente (documentado Case H); producto podría preferir `scheduled_start` ASC si cambia la regla de negocio.
- `onlyExpired` depende de que exista sesión EXPIRADA con contexto de confirmación; si el proceso nunca creó sesión (solo claim durable), un `"1"` post-start no produce `CONFIRMATION_EXPIRED` (cae a menú) — intencional para no secuestrar históricos.
- Integración SQL gated por `RUN_DB_INTEGRATION_TESTS=true`.
