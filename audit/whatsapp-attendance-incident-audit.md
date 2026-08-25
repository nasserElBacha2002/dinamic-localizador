# WhatsApp attendance incident audit

> **Update (forwarded locations, 2026-08-25):** mitigación anti-forward **reimplementada** en modo best-effort: solo `Forwarded` / `FrequentlyForwarded` top-level. Ver `audit/whatsapp-forwarded-location-audit.md`.

**Mode:** read-only (code + migrations + config). No production DB/logs for the specific incident were available in this session.  
**Date:** 2026-08-24  
**Repo:** `dinamic-localizador`  
**Scope:** location check-in, forwarded locations, reminders, assignment notifications, confirmation replies, templates, idempotency.

---

## 1. Executive Summary

| Question | Answer |
|----------|--------|
| ¿Puede una ubicación **reenviada** registrar asistencia? | **Mitigado en código (post-fix):** se rechaza si Twilio envía `Forwarded=true` o `FrequentlyForwarded=true` **antes** de geofence/asistencia. |
| ¿Por qué ocurría? | Históricamente el backend solo exigía lat/lng; geofence valida coordenadas, no procedencia. |
| ¿WhatsApp/Twilio entrega metadata para detectarlo? | **SÍ — contrato Twilio confirmado por documentación oficial:** webhooks inbound WhatsApp pueden incluir `Forwarded` y `FrequentlyForwarded` con valor `true` cuando el mensaje fue reenviado. La implementación lee únicamente esos campos. |
| ¿El sistema la conserva / usa? | **Sí para decisión:** `extractLocationMessageMetadata` → gate en `routeLocationMessage`. `raw_payload` sigue guardando el webhook; `.passthrough()` no es el mecanismo anti-forward. |
| ¿Hubo realmente dos recordatorios? | **NO DEMOSTRADO para el incidente concreto** (faltan filas DB / wamid). Por código, **es más probable** que sean **dos eventos distintos** (p.ej. arrival reminder 3 vars vs confirmation/assignment 4 vars) con copy similar en Twilio Content. |
| ¿Uno podría ser confirmación con template de reminder? | **POSIBLE / PROBABLE a nivel de Content SID en Twilio (fuera del repo).** El código **no** mezcla builders: cada `notification_type` usa su SID y su mapa de variables. Un SID mal cargado en env o un body Meta mal armado producirían exactamente el efecto visual. |
| ¿Variables invertidas? | **Builders del backend:** orden documentado y estable. **Body Meta:** **NO DEMOSTRADO** aquí. El patrón del Msg2 (`… - 15:50 comienza a las 22/08/2026`) encaja con body tipo *arrival* (3 slots) alimentado con vars de *confirmation/assignment* (`{{3}}=fecha`) **o** body que inserta `{{4}}` junto al local y `{{3}}` tras “comienza a las”. |
| ¿Dos productores distintos? | **SÍ (demostrado):** job de attendance reminders + worker de assignment + respuestas TwiML freeform del bot. |
| ¿Idempotencia saliente? | **SÍ parcial (demostrado):** unique por tipo+versión (attendance) y por assignment+tipo (assignment). Race A/B mitigada por unique + claim; `isRunning` es **solo in-process** (multi-réplica depende del unique). |
| ¿Dedup inbound por MessageSid/wamid? | **SÍ (demostrado):** `claimInboundMessage` + UQ en `whatsapp_webhook_events` / `whatsapp_messages` / `attendance_records.source_message_sid`. |

**Clasificación preliminar del incidente**

| Caso | Veredicto |
|------|-----------|
| A — ubicación reenviada | **ROOT-1:** gap histórico cerrado con política anti-forward alineada al contrato Twilio (`Forwarded` / `FrequentlyForwarded`). Reproducción E2E en producción **no ejecutada** en esta sesión. |
| B — dos mensajes “tipo reminder” | **Más alineado a hipótesis H2/H3** (dos eventos / template body mismatch) que a H1 (doble reminder del mismo tipo). H1/H4/H5 **no descartadas** sin evidencia DB. **CASO B NO DEMOSTRADO.** |

---

## 2. Evidencia del incidente

### Caso A (ubicación reenviada)

Reconstrucción lógica desde código (no hay wamid del caso):

```text
T0  Reminder / menú pide ubicación o “Llegué”
T1  Usuario reenvía pin histórico del mismo chat
T2  Twilio POST /whatsapp con Latitude + Longitude (+ MessageSid nuevo)
T3  claimInboundMessage(MessageSid) → CLAIMED
T4  isLocationMessage = true (solo Lat/Lng)
T5  Sin sesión → processDirectLocationAttendance  OR  WAITING_LOCATION → processLocationCheckIn
T6  Geofence OK (coordenadas dentro del radio)
T7  attendance_records insert con received_at = getBotNow(), source_message_sid = MessageSid
```

**Hecho clave:** el MessageSid del reenvío es **nuevo**; la idempotencia **no** bloquea. Las coordenadas son las del pin; la “edad” del pin **no se valida**.

### Caso B (dos mensajes parecidos)

Textos conceptuales del incidente:

| # | Patrón observado | Encaje más probable en código |
|---|------------------|-------------------------------|
| Msg1 | `…inventario en {local} comienza a las {HH:mm}` | `ARRIVAL_REMINDER_15_MIN` → vars `1=nombre, 2=serviceRef, 3=hora` |
| Msg2 | `…inventario en {local} - {HH:mm} comienza a las {DD/MM/YYYY}` | Flujo **4 variables** (`ATTENDANCE_CONFIRMATION_REMINDER` o `EVENTUAL_OPERATION_ASSIGNED`) con **body Meta** que usa `{{3}}` donde el copy dice “hora”, o mezcla `{{2}}`/`{{4}}`/`{{3}}` |
| Msg3 (sección 15) | `✅ Asistencia confirmada.` + `Te esperamos…` + `Cuando llegues, compartí tu ubicación…` | **TwiML freeform** en `attendance-confirmation-response.handler.ts` tras confirmar participación — **no** es Content template |

Sin filas de `whatsapp_attendance_notifications` / `whatsapp_operation_assignment_notifications` / outbound `whatsapp_messages` del empleado+operación, **no se puede cerrar** si Msg1/Msg2 fueron el mismo `notification_type` duplicado.

---

## 3. Flujo actual de ubicación

```text
POST /whatsapp
  → twilioSignature middleware
  → twilioWebhookSchema (MessageSid, From, To, Body?, Latitude?, Longitude?, …passthrough)
  → company context resolve
  → whatsappBotService.handleWebhook
       1. claimInboundMessage(companyId, MessageSid, payloadHash)
       2. persist whatsapp_messages (lat/lng/body/raw_payload)
       3. if Latitude && Longitude:
            whatsappRouterService.routeLocationMessage
              ├─ active WAITING_LOCATION → processLocationCheckIn
              ├─ checkout session → checkout location
              └─ no session → processDirectLocationAttendance
                   → resolveAttendanceLocationIntent (CHECK_IN / CHECK_OUT / AMBIGUOUS / NONE)
                   → processLocationCheckIn / checkout
       4. else text → intents (Llegué, menú, confirmación de asistencia, etc.)
```

**Archivos clave**

| Capa | Path |
|------|------|
| Route | `backend/src/routes/twilio.routes.ts` |
| Controller | `backend/src/controllers/twilio-webhook.controller.ts` |
| Schema | `backend/src/schemas/twilio-webhook.schema.ts` |
| Bot orchestration | `backend/src/services/whatsapp-bot.service.ts` |
| Router | `backend/src/services/whatsapp-router/whatsapp-router.service.ts` |
| Direct location | `backend/src/services/whatsapp-router/direct-attendance-location.service.ts` |
| Check-in | `backend/src/services/bot/check-in-attendance.flow.ts` |
| Claim idempotency | `backend/src/repositories/whatsapp-webhook-event.repository.ts` |

---

## 4. Análisis de ubicación reenviada

### Qué se parsea

```ts
// twilio-webhook.schema.ts — campos explícitos
MessageSid, From, To, Body?, Latitude?, Longitude?, Address?, Label?, NumMedia?
// + .passthrough() → otros campos Twilio pueden sobrevivir en el objeto parseado
```

### Qué decide “es location”

```ts
// whatsapp-bot.service.ts
isLocationMessage = Boolean(payload.Latitude && payload.Longitude)
```

### Qué **no** existía en el código de negocio (histórico del incidente)

Antes del fix anti-forward:

- Lectura de `Forwarded` / `FrequentlyForwarded`
- Rechazo de ubicación reenviada antes de geofence

### Contrato Twilio confirmado (post-fix)

Twilio documenta oficialmente que los webhooks inbound de WhatsApp pueden incluir:

- `Forwarded` = `true`
- `FrequentlyForwarded` = `true`

cuando el mensaje fue reenviado. La implementación productiva usa **solo** esos campos (sin aliases Meta/`ChannelMetadata`).

Ausencia de ambos campos → mensaje normal (`isForwarded=false`, `isFrequentlyForwarded=false`).

### Qué sigue fuera de alcance de ROOT-1

- Parser de Google Maps URL / texto `lat,lng` para check-in (**sigue rechazado / no soportado**)
- Uso de timestamp Twilio del mensaje para elegibilidad de frescura del pin
- Reproducción E2E del incidente en producción

### Dónde se “pierde” la metadata (si Meta/Twilio la enviara)

```text
Meta/Twilio form body
  → Zod passthrough (podría conservar campos desconocidos en memoria)
  → raw_payload JSON (sin AccountSid) en whatsapp_messages
  → Attendance / geofence / intent  ← SOLO leen Latitude/Longitude (+ MessageSid)
```

**Conclusión Caso A:** fallá **por omisión de diseño**, no por un if roto. Cualquier pin con coordenadas dentro del geofence, reenviado o no, puede completar check-in (incluido **sin** “Llegué”, vía location directa).

### Timestamps

| Reloj | Uso |
|-------|-----|
| Twilio `DateSent` / age del pin | **No leído** |
| `getBotNow()` al procesar | Elegibilidad de jornada + `received_at` de asistencia |
| `pendingLocation.receivedAt` | Snapshot al recibir LOCATION si luego elige operación |

Una ubicación reenviada obtiene **timestamp de procesamiento nuevo**; validar solo “mensaje reciente” **no** probaría frescura del pin.

---

## 5. Inventario de mensajes salientes

| Evento lógico | Trigger | Código | Canal | Template / copy | Variables |
|---------------|---------|--------|-------|-----------------|-----------|
| Recordatorio llegada T-15 | Cron 60s | `jobs/attendance-reminder.job.ts` → `attendance-reminder.service.ts` | Content API | `TWILIO_ARRIVAL_REMINDER_CONTENT_SID` | `1` nombre, `2` serviceRef, `3` HH:mm inicio |
| Recordatorio salida T-15 | Mismo job | idem | Content API | `TWILIO_EXIT_REMINDER_CONTENT_SID` | `1` nombre, `2` serviceRef, `3` HH:mm fin |
| Sin check-in al inicio | Mismo job | idem | Content API | `TWILIO_TEMPLATE_NO_CHECKIN_SID` | `1` nombre, `2` serviceRef |
| Recordatorio **confirmación de asistencia** | Mismo job | idem + crea sesión bot | Content API | `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID` | `1` nombre, `2` serviceRef, `3` fecha, `4` hora |
| Asignación operación eventual | Enqueue en assign + worker | `operation-assignment-*.ts` | Content API | `TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID` | `1` **primer** nombre, `2` serviceRef, `3` fecha, `4` hora |
| Reply “✅ Asistencia confirmada…” | Usuario responde sí al reminder de confirmación | `attendance-confirmation-response.handler.ts` | **TwiML freeform** | N/A | serviceRef + `fecha — hora` en texto |
| Llegada registrada | Check-in OK | `bot-response.builder.ts` `buildArrivalRegisteredMessage` | TwiML freeform | N/A | servicio, hora, distancia |
| Menús / pedir ubicación | Intents / sesión | `bot-response.builder.ts`, menús | TwiML | N/A | — |

`serviceRef` = `name - address - locality` (`format-service-reference.ts`). **El builder nunca concatena la hora dentro de `{{2}}`.**

---

## 6. Análisis de los dos mensajes observados

### Separación de eventos

| | Evento A (Msg1) | Evento B (Msg2) |
|--|-----------------|-----------------|
| Forma | 3 huecos semánticos (local + **hora**) | local(+hora?) + **fecha** tras “comienza a las” |
| Productor candidato | `ARRIVAL_REMINDER_15_MIN` | `ATTENDANCE_CONFIRMATION_REMINDER` **o** `EVENTUAL_OPERATION_ASSIGNED` |
| Tabla | `whatsapp_attendance_notifications` | attendance **o** `whatsapp_operation_assignment_notifications` |
| ¿Mismo job tick? | Attendance job | Attendance job **o** assignment worker |

### Hipótesis (incidente B)

| ID | Hipótesis | Estado |
|----|-----------|--------|
| H1 | Dos reminder jobs del **mismo** tipo (doble ARRIVAL) | **POSIBLE pero menos probable** — existe UQ `(operation_id, employee_id, notification_type, schedule_version)`. Requiere fallo de claim/unique, otro `schedule_version`, o SIDs distintos. **NO DEMOSTRADO** sin DB. |
| H2 | Un mensaje confirmación/asignación y otro reminder | **PROBABLE** — dos productores, shapes de vars distintos, copy Meta puede parecer “reminder”. |
| H3 | Dos eventos usan el **mismo body** Meta / SID mal cableado | **PROBABLE** si env Content SIDs o bodies en Twilio Console están cruzados. Código **no** reutiliza el builder de arrival para confirmation. |
| H4 | Un único evento ejecutado dos veces | **NO DEMOSTRADO**; mitigado por unique+claim; multi-réplica depende del unique. |
| H5 | Retry Meta/Twilio mostró dos deliveries del mismo send | **NO DEMOSTRADO**; si `provider_message_sid` / wamid es **el mismo**, apuntaría aquí; si **distintos**, son dos sends lógicos. |
| H6 | Legacy + nuevo worker en paralelo | **Parcialmente sí** a nivel de producto (assignment worker + attendance job coexisten **por diseño**). No hay segundo “legacy arrival job” paralelo en código. |

**Msg “✅ Asistencia confirmada”** es un **tercer** evento (respuesta freeform), distinto de Msg1/Msg2 tipo Content.

---

## 7. Auditoría de templates

| Template (env SID) | Evento esperado | Vars backend | Riesgo |
|--------------------|-----------------|--------------|--------|
| `TWILIO_ARRIVAL_REMINDER_CONTENT_SID` | Reminder llegada | 1 nombre, 2 local, 3 **hora** | Body Meta debe esperar 3 params con hora en `{{3}}` |
| `TWILIO_EXIT_REMINDER_CONTENT_SID` | Reminder salida | 1, 2, 3 **hora fin** | Idem |
| `TWILIO_TEMPLATE_NO_CHECKIN_SID` | Al inicio sin check-in | 1, 2 | — |
| `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID` | Pedir confirmar participación | 1, 2, 3 **fecha**, 4 **hora** | Si el body Meta es copy de arrival (`comienza a las {{3}}`), `{{3}}` muestra **fecha** → patrón Msg2 |
| `TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID` | Aviso de asignación ONE_TIME | 1 **firstName**, 2, 3 fecha, 4 hora | Mismo riesgo de body; además `{{1}}` es solo primer nombre |

**Bodies literales (“te recordamos que tu inventario…”): NO DEMOSTRADO en repo** — viven en Twilio Content.

**Cableado incorrecto en código TypeScript (enum → SID → builder): no encontrado.** El riesgo dominante es **configuración Meta/env**, no un swap en el mapper TS.

---

## 8. Auditoría de jobs / reminders

### Productores

1. **`startAttendanceReminderJob`** (`server.ts`) — `setInterval` 60s, flag `ATTENDANCE_REMINDER_JOB_ENABLED`, guard `isRunning` **por proceso**.
2. **`startOperationAssignmentNotificationJob`** — worker aparte; **default `OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED=false`** en ejemplos; lease + attempts.
3. **Inbound bot** — TwiML (confirmación / check-in / menús).
4. **Dev/CLI** — `scripts/send-attendance-reminder.ts`, `routes/dev-reminder.routes.ts` (solo entornos no prod según patrón del proyecto).

### Ventanas temporales (attendance job)

| Tipo | Ventana |
|------|---------|
| Arrival | `expected_start_at ∈ [now, now+15m]` |
| Exit | `expected_end_at ∈ [now, now+15m]` |
| No check-in | start ∈ `[now-1m, now]` |
| Confirmation | `scheduled_start > now` AND `start - hours_before <= now` (ONE_TIME, status PENDING) |

Tick cada 60s **sin** marca previa podría re-seleccionar candidatos; la **inserción/claim + unique** es lo que evita re-send del mismo tipo+versión.

### Coexistencia “legacy + nuevo”

- Assignment notifications (091) y attendance reminders (011→035) son **pipelines separados**, no dos crons del mismo reminder.
- Check-in: coexisten **“Llegué” → WAITING_LOCATION`** y **location directa** (sin Llegué).

---

## 9. Idempotencia y concurrencia

### Saliente — attendance

- Unique: `UQ_whatsapp_attendance_notifications_operation_employee_type_version`  
  `(operation_id, employee_id, notification_type, schedule_version)`
- `schedule_version`: workday version (ONE_TIME) o `YYYYMMDD` (RECURRING); confirmation usa `confirmation_schedule_version` del assignment.
- Flujo: insert PENDING → claim attempt → send Twilio → `markSent` (con recovery `SENT_RECOVERY_REQUIRED` si el send OK pero persist falla).

### Saliente — assignment

- Unique: `UQ_woan_company_assignment_type` `(company_id, operation_assignment_id, notification_type)`
- Claim con `UPDLOCK`/`READPAST` + lease; attempts table unique `(notification_id, attempt_number)`.

### Concurrencia multi-réplica

| Control | Alcance |
|---------|---------|
| `isRunning` en job | **Un solo proceso Node** — dos containers pueden tickear a la vez |
| Unique + claim SQL | **Protección real** contra doble SENT del mismo key |
| Race `if (!sent) send` sin unique | **Evitada** en el diseño actual para estos tipos |

**Gap residual:** si `markSent` falla tras Twilio 201, puede quedar `SENT_RECOVERY_REQUIRED` / reintento — riesgo de **doble entrega de proveedor** con un solo intent de negocio (mitigado parcialmente por recovery; **NO DEMOSTRADO** tasa en prod).

---

## 10. Webhook deduplication

| Mecanismo | Detalle |
|-----------|---------|
| `whatsapp_webhook_events` UQ `(company_id, message_sid, event_type)` | Claim atómico antes de lógica de bot |
| Replay | Devuelve TwiML previo (`IDEMPOTENT_REPLAY`) |
| Payload anomaly | Hash distinto mismo SID → 409 |
| `whatsapp_messages` UQ MessageSid | Defensa en profundidad |
| `attendance_records` UQ `source_message_sid` | Un SID → una asistencia |

**Reenvío de ubicación = MessageSid nuevo → no es dedup del pin.**

---

## 11. Estados de asistencia (nomenclatura ambigua)

| Estado de negocio | Qué significa | Dónde vive |
|-------------------|---------------|------------|
| Asignado | Tiene `operation_assignments` vigente | DB assignments |
| Confirmó participación | `confirmation_status = CONFIRMED` (o equivalente) | Tras reply al confirmation reminder / menú |
| “Asistencia confirmada” (copy bot) | **Solo participación**, no check-in físico | TwiML handler |
| Llegó / check-in | `attendance_records` con validación geofence | Check-in flow |
| Reminder enviado | Fila notification `SENT` | attendance / assignment notification tables |

**Ambigüedad P2:** el string “Asistencia confirmada” se confunde fácilmente con “llegada registrada”.

---

## 12. Hallazgos

| ID | Sev | Archivo / área | Problema | Evidencia | Impacto |
|----|-----|----------------|----------|-----------|---------|
| F-01 | **P0** | `whatsapp-bot.service.ts` `isLocationMessage`; schema Twilio; check-in flows | No se detecta ni rechaza ubicación reenviada / no actual | Ausencia total de `forwarded`/`context` en lógica | Check-in fraudulento / falso positivo de presencia |
| F-02 | **P0** | Direct location + geofence | Coordenadas históricas válidas bastan si caen en radio | `processDirectLocationAttendance` / `processLocationCheckIn` | Igual que F-01, sin necesidad de “Llegué” |
| F-03 | **P1** | Twilio Content (fuera repo) + builders 3 vs 4 vars | Copy “reminder” reutilizado / slots Meta desalineados pueden hacer que confirmation/assignment **parezcan** otro reminder con fecha en “comienza a las” | Msg2 vs builders; bodies NO DEMOSTRADO en repo | Confusión operativa; posible mala UX / doble aviso |
| F-04 | **P1** | Producto: assignment + confirmation + arrival | Tres avisos proactivos posibles para la misma jornada ONE_TIME | Tablas/jobs distintos | “Duplicación” percibida aunque sean eventos distintos |
| F-05 | **P2** | `attendance-reminder.job.ts` `isRunning` | Lock solo in-memory | Código del job | Depende del unique SQL bajo multi-instance |
| F-06 | **P2** | Observabilidad | Correlation jobRunId no siempre explícita en un solo log line | Logs parciales por tipo | Dificulta forense del incidente B |
| F-07 | **P2** | Naming “Asistencia confirmada” | Confunde confirmación de participación con check-in | `attendance-confirmation-response.handler.ts` | Mal diagnóstico de incidentes |
| F-08 | **P3** | `Address`/`Label` en schema | Parseados pero no usados en asistencia | schema vs flows | Deuda menor |
| F-09 | **P3** | raw_payload | Puede contener metadata no explotada | create message | Oportunidad de auditoría forense |

---

## 13. Causa raíz

| ID | Causa | Independiente |
|----|-------|---------------|
| **ROOT-1** | Ubicación reenviada aceptada: no hay señal de forward ni prueba de presencia “en vivo”; solo geofence + MessageSid nuevo | **Sí** |
| **ROOT-2** | Duplicación **real** del mismo `notification_type` | **NO DEMOSTRADO** para el incidente; infraestructura anti-dup existe |
| **ROOT-3** | Template/body incorrecto o SID mal configurado en Twilio haciendo que un evento 4-var se lea como reminder | **Sospecha fuerte** para Msg2; verificar Console + env |
| **ROOT-4** | Variables “invertidas” en **backend TS** | **No demostrado** — órdenes de builders son consistentes; el síntoma apunta a **body Meta** vs mapa |
| **ROOT-5** | Falta de idempotencia saliente | **No como ausencia total** — hay unique/claim; gaps en multi-réplica in-memory y recovery post-send |

**No agrupar ROOT-1 con Caso B:** son bugs/ámbitos independientes.

---

## 14. Recomendaciones

### Corrección mínima

1. **Caso A:** rechazar o mandar a revisión ubicaciones con señal de forward cuando esté disponible en el webhook; si Twilio no la expone, **exigir flujo que reduzca replay** (p.ej. pedir location “fresh” tras “Llegué”, o live location, o challenge) — diseño de producto pendiente de evidencia de payload real.
2. **Caso B:** para el `employeeId`/`operationId` del incidente, consultar DB:
   - `whatsapp_attendance_notifications` (types + `provider_message_sid` + `sent_at` + `schedule_version`)
   - `whatsapp_operation_assignment_notifications`
   - outbound `whatsapp_messages` (`template_sid`, `template_variables_json`)
3. En Twilio Console, diff de bodies de ARRIVAL vs CONFIRMATION vs ASSIGNED frente a vars documentadas en `.env.example` / builders.

### Hardening recomendado

- Persistir y loguear flags forward/context si aparecen en raw.
- Correlación `notificationType + operationId + employeeId + attempt + providerSid` en un log estructurado único.
- Revisar copy freeform “Asistencia confirmada” → “Participación confirmada” (o similar).
- Distributed lock / leader election para el attendance job (además del unique).
- Test de contrato: snapshot de variables por `notification_type` vs fixtures de body Meta.

---

## 15. Plan de implementación (fases)

1. **Forense incidente B** — queries DB + export Twilio message SIDs (sin cambiar código).
2. **Captura payload** — log temporal de keys del body Twilio en LOCATION (staging) para confirmar si llega `Forwarded`/equivalente.
3. **Fix P0 location** — política anti-replay acordada + tests.
4. **Alineación templates** — corregir bodies/SIDs en Twilio; tests de variables.
5. **Observabilidad** — correlation ids en sends.
6. **Concurrencia job** — lock distribuido si hay >1 réplica.

---

## Mapa de escenarios del brief (A–H)

| Escenario | Veredicto |
|-----------|-----------|
| A) reminder duplicado | Posible; no es la explicación por defecto sin DB |
| B) confirmación + reminder correctos pero parecidos | **Muy plausible** |
| C) confirmación usando template de reminder | Plausible vía **SID/body Meta**, no vía swap en TS |
| D) variables mal ordenadas en backend | **Poco probable**; síntoma cuadra más con body Meta |
| E) job ejecutado dos veces | Mitigado por unique; no descartado al 100% |
| F) dos jobs distintos | **Demostrado como arquitectura** |
| G) retry proveedor | Discriminable por wamid igual/distinto — falta dato |
| H) combinación | **Probable** (F + B/C) independiente de ROOT-1 |

---

## Datos faltantes (NO DEMOSTRADO sin ellos)

1. Filas notification + `provider_message_sid` / wamid del empleado y operación del incidente.  
2. Payload crudo Twilio de un **forward de ubicación** real.  
3. Bodies actuales de Content Templates en Twilio Console.  
4. Valores env de Content SIDs en el ambiente donde ocurrió.  
5. `confirmation_reminder_hours_before` y timestamps `sent_at` relativos a `scheduled_start`.

---

## Suggested next command

`/fix-dinamic-review` — solo **después** de forense DB/Twilio del incidente B y decisión de producto sobre anti-forward (Caso A).

Para implementar sin forense completo, el único cambio claramente justificado solo con código es el **hardening de ubicación reenviada / presencia** (ROOT-1).
