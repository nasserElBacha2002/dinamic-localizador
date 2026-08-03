# Auditoría: panel de observabilidad de conversaciones WhatsApp

**Fecha:** 2026-08-03  
**Repositorio:** `dinamic-localizador`  
**Alcance:** solo lectura — sin cambios de código de aplicación.  
**Estado de auditoría:** `PARTIALLY_READY`

---

## 1. Resumen ejecutivo

### Estado general

La plataforma **ya tiene piezas reutilizables** para un panel de observabilidad funcional (mensajes, sesiones, claims de webhook, recordatorios, flag de superadmin de plataforma), pero **no puede reconstruir una conversación completa ni el “por qué” de las decisiones del bot** sin trabajo previo significativo de trazabilidad.

### Nivel actual de trazabilidad

| Capacidad | Nivel |
|-----------|--------|
| Mensaje entrante persistido | Medio (tabla `whatsapp_messages`) |
| Respuesta TwiML vinculada al inbound | Bajo (outbound sin `message_sid`; no hay `conversation_id`) |
| Decisiones / candidatos descartados | Bajo (solo `console.info`, no SQL) |
| Estados Twilio (delivered/failed/read) | **Nulo** (sin status callback HTTP) |
| Recordatorios proactivos | Medio (`whatsapp_attendance_notifications`) |
| Correlación end-to-end | Bajo (`MessageSid` parcial; sin `correlationId`/`traceId`) |
| UI operativa | Solo simulador de bot; sin inbox de producción |

### Viabilidad del panel

**Sí, es viable** sobre la arquitectura actual, siempre que se trate como producto de **observabilidad funcional append-only**, no como dependencia del bot. El patrón de API `requirePlatformAdmin` + `/api/platform/*` ya existe.

### Principales bloqueos

1. **No hay endpoint de status callback de Twilio** → no se puede mostrar delivered/undelivered/failed/read.
2. **Diagnósticos de candidatos viven solo en logs de consola** → Caso 1 (respuesta incorrecta) no es respondible desde DB.
3. **No existe entidad de conversación ni correlación explícita** entre inbound, outbound, sesión y recordatorio.
4. **Outbound de bot (TwiML) no guarda MessageSid de Twilio** (respuesta síncrona en el webhook).
5. **Recordatorios no se insertan en `whatsapp_messages`** → historial de chat incompleto.

### Riesgos críticos

- Exponer `raw_payload` / coordenadas / teléfonos sin sanitización en un panel SUPERADMIN.
- Hacer de la traza un requisito síncrono del webhook (latencia / fallos).
- Volumen de tablas sin retención.
- Confundir “superadmin de plataforma” (`users.is_platform_admin`) con un rol de empresa llamado `SUPERADMIN` (este último **no existe** como rol de compañía).

### Conclusión

```text
PARTIALLY_READY
```

Se puede diseñar e implementar por fases. **No está READY** hasta resolver correlación mínima + callbacks Twilio + persistencia de decisiones. **No está BLOCKED** por la arquitectura: hay base de datos, bot modular y guard de plataforma.

---

## 2. Arquitectura actual reconstruida

### Diagrama real (evidencia de código)

```text
Twilio POST /api/webhooks/twilio/whatsapp
    ↓
express.urlencoded (app.ts)
    ↓
validateTwilioSignature (middleware/validate-twilio-signature.ts)
    → twilio.validateRequest + TWILIO_WEBHOOK_URL
    ↓
twilioWebhookController.handleWhatsApp
    (controllers/twilio-webhook.controller.ts)
    ↓
whatsappCompanyContextService.resolve
    (services/whatsapp-company-context.service.ts)
    orden: forced → sesión activa → número receptor → teléfono empleado → default company
    ↓
whatsappBotService.handleWebhook / handleWebhookWithSettings
    (services/whatsapp-bot.service.ts)
    ↓
whatsappWebhookEventRepository.claimInboundMessage
    (idempotencia MessageSid + payload hash)
    ↓
whatsappMessageRepository.create (INBOUND + raw_payload sanitizado)
    ↓
whatsappRouterService.routeTextMessage | routeLocationMessage
    (services/whatsapp-router/whatsapp-router.service.ts)
    ↓
handlers (attendance / checkout / workday / absence / confirmation / menu / …)
    ↓
validaciones dominio (workdays, geofence, attendance, modules)
    ↓
persistencia de negocio (attendance_records, bot_sessions, absences, …)
    ↓
TwiML response + whatsapp_messages OUTBOUND (message_sid = null)
    ↓
whatsappWebhookEventRepository.markProcessed (response_body para replay)

Paralelo (proactivo):
attendance-reminder.job (60s)
    → attendanceReminderService
    → twilioOutboundService.sendWhatsAppTemplate
    → whatsapp_attendance_notifications (SID + status PENDING/SENT/FAILED/…)
```

### Hallazgo crítico de arquitectura

**No existe ruta HTTP de status callback.**  
`WhatsappWebhookEventType` incluye `"STATUS_CALLBACK"` en `whatsapp-webhook-event.repository.ts`, pero no hay `POST` que lo consuma ni actualización de estados `delivered`/`failed` desde Twilio.

### Archivos núcleo del flujo

| Paso | Archivo | Función |
|------|---------|---------|
| Mount | `backend/src/routes/index.ts` | `apiRouter.use("/webhooks/twilio", …)` |
| Ruta | `backend/src/routes/twilio.routes.ts` | `POST /whatsapp` |
| Firma | `backend/src/middleware/validate-twilio-signature.ts` | `createValidateTwilioSignature` |
| Controller | `backend/src/controllers/twilio-webhook.controller.ts` | `handleWhatsApp` |
| Empresa | `backend/src/services/whatsapp-company-context.service.ts` | `resolve` |
| Bot | `backend/src/services/whatsapp-bot.service.ts` | `handleWebhookWithSettings` |
| Router | `backend/src/services/whatsapp-router/whatsapp-router.service.ts` | `routeTextMessage` / `routeLocationMessage` |
| Intent | `backend/src/services/bot/bot-intent.parser.ts` | `parseBotIntent` |
| Outbound plantillas | `backend/src/services/twilio-outbound.service.ts` | `sendWhatsAppTemplate` |
| Recordatorios | `backend/src/services/attendance-reminder.service.ts` | `runDueReminders*` |

---

## 3. Inventario de flujos de conversación

| Nombre | Trigger | Entrada | Servicio principal | Entidades | Decisiones principales | Resultado | Mensaje saliente | Errores | Trazabilidad actual | Vacíos |
|--------|---------|---------|-------------------|-----------|------------------------|-----------|------------------|---------|---------------------|--------|
| Llegada (check-in) | "Llegué" / menú | webhook | `attendance.handler` → `whatsappBotService.startCheckIn` | employee, workday, operation, location, attendance | ventana horaria, candidatos, geofence, ausencia | pide ubicación / crea attendance | textos en `bot-response.builder.ts` | no jornada, fuera radio, duplicado | logs + `whatsapp_messages` + `bot_sessions` + `attendance_records` | candidatos descartados no en DB |
| Salida (check-out) | "Me voy" / "Terminé" | webhook | `checkout.handler` | attendance, workday, location | check-in previo, sesión, geofence | checkout | textos checkout | sin check-in, expirado | similar a llegada | mismos vacíos de diagnóstico |
| Mi jornada | intent workday | webhook | `workday.handler` → `employeeWorkdayService` | workdays hoy | listado / vacío | texto jornada | formato workday | — | mensaje OUTBOUND | sin snapshot de filas consultadas |
| Próximos trabajos | intent upcoming | webhook | `upcoming-assignments.handler` | assignments | fechas futuras | listado | `NO_UPCOMING_ASSIGNMENTS_MESSAGE` | — | mensaje | sin snapshot |
| Confirmación asistencia | plantilla + reply | reminder + webhook | `attendance-confirmation-response.handler` / assignment confirmation | assignment, notification, session | PENDING confirmation | actualiza estado | confirmación / no disponible | SID template missing | `whatsapp_attendance_notifications` + session | template body no local |
| No disponibilidad | "No puedo asistir" | webhook | assignment unavailability path | assignments | selección multi | registro | textos workday service | sin trabajos | parcial | — |
| Ausencias | "Pedir ausencia" / vacaciones | webhook | `absence.handler` + `absence-bot.service` | absence request, attachments, session | tipo, fechas, adjuntos | crea solicitud | menú ausencia | módulo off, GCS | sessions + absences | media Twilio complex |
| Menú / ayuda / saludo | help / greeting / unknown | webhook | `menu.handler` / `global-command.handler` | modules | módulos activos | menú | `GREETING_MESSAGE` / menú dinámico | — | OUTBOUND | intent "unknown" → menú, no error tipado |
| Cancelar flujo | "Cancelar" | webhook | `global-command.handler` | bot_sessions | cancela activa | `GLOBAL_CANCEL_MESSAGE` | — | session CANCELLED | — |
| Selección numérica | "1","2",… | webhook | selección operación/checkout/ausencia | session context | índice válido | avanza flujo | error selección | INVALID_SELECTION | session context_json | — |
| Ubicación | media location | webhook | routeLocation → check-in/out | coords, store | radio + margen | attendance/checkout | éxito / review / rechazo | coords inválidas | lat/lng en messages + attendance | coords sensibles |
| Empleado desconocido | cualquier | router | early exit | phone | findByPhone | texto | `UNKNOWN_EMPLOYEE_MESSAGE` | — | mensaje | multiempresa ambigua separada |
| Empresa ambigua | multi company phone | company context | `resolve` | employees multi | bloquea | `AMBIGUOUS_COMPANY_MESSAGE` | — | logs masked | decisión no en tabla conversación |
| Recordatorio llegada/salida/no-check-in/confirmación | job 60s | `attendance-reminder.job` | `attendanceReminderService` | workdays, notifications | ventanas + elegibilidad | template Twilio | Content SID vars | claim fail, Twilio fail | `whatsapp_attendance_notifications` | no fila en `whatsapp_messages`; sin delivery callbacks |
| Simulador | UI interna | `/api/.../bot-simulator` | `bot-simulator.service` | same bot | igual | TwiML sim | — | technical details in-memory | no es producción |

**Intents canónicos** (`bot-intent.parser.ts`): `arrival`, `checkout`, `menu`, `absence`, `workday`, `upcoming_assignments`, `confirm_attendance`, `report_unavailability`, `location`, `operation_selection`, `cancel`, `unknown`.

---

## 4. Inventario de componentes y archivos

| Archivo | Capa | Responsabilidad | Relevancia panel |
|---------|------|-----------------|------------------|
| `backend/src/routes/twilio.routes.ts` | API | Webhook WhatsApp | Alta — punto de entrada |
| `backend/src/controllers/twilio-webhook.controller.ts` | API | Delega al bot | Media |
| `backend/src/middleware/validate-twilio-signature.ts` | Security | Firma Twilio | Media (auditoría acceso) |
| `backend/src/services/whatsapp-bot.service.ts` | Domain | Orquestación webhook | **Crítica** |
| `backend/src/services/whatsapp-router/whatsapp-router.service.ts` | Domain | Routing de intents | **Crítica** |
| `backend/src/services/whatsapp-router/*.handler.ts` | Domain | Flujos | **Crítica** |
| `backend/src/services/bot/bot-response.builder.ts` | Domain | Copy respuestas | Alta (mapear result codes) |
| `backend/src/services/bot/bot-intent.parser.ts` | Domain | Clasificación | Alta |
| `backend/src/services/whatsapp-company-context.service.ts` | Domain | Tenant resolution | Alta (Caso 4) |
| `backend/src/services/employee-workday-availability.service.ts` | Domain | Candidatos + diagnosis | **Crítica** (Caso 1) |
| `backend/src/services/twilio-outbound.service.ts` | Integration | Templates | Alta (Caso 2) |
| `backend/src/services/attendance-reminder.service.ts` | Jobs | Recordatorios | Alta |
| `backend/src/repositories/whatsapp-message.repository.ts` | Data | Mensajes | **Crítica** |
| `backend/src/repositories/whatsapp-webhook-event.repository.ts` | Data | Idempotencia webhook | Alta |
| `backend/src/repositories/bot-session.repository.ts` | Data | Sesiones | Alta |
| `backend/src/repositories/attendance-notification.repository.ts` | Data | Reminders | Alta |
| `backend/src/middleware/require-platform-admin.ts` | Security | Guard panel | **Crítica** |
| `backend/src/routes/platform-company.routes.ts` | API | Patrón `/api/platform` | Alta (reutilizar) |
| `frontend/src/pages/bot-simulator/*` | UI | Chat simulado | Media (patrón chat, no prod) |
| `frontend/src/pages/platform/PlatformCompaniesPage.tsx` | UI | Superadmin | Media (nav pattern) |
| `frontend/src/design-system/components/DataTable.tsx` | UI | Tablas | Alta |
| `database/migrations/003_whatsapp_bot_flow.sql` | DB | messages + sessions | Alta |
| `database/migrations/073_*.sql` / `074_*.sql` | DB | webhook events | Alta |
| `database/migrations/011_*.sql` … `075_*.sql` | DB | notifications | Alta |
| `database/migrations/016_platform_superadmin.sql` | DB | `is_platform_admin` | Alta |

---

## 5. Persistencia actual

### Tablas relevantes (hechos)

#### `whatsapp_messages` (`003_whatsapp_bot_flow.sql` + company_id multi-tenant)

Columnas base: `id`, `message_sid`, `direction` (INBOUND/OUTBOUND), `employee_id`, `phone_from`, `phone_to`, `message_type` (TEXT/LOCATION/UNKNOWN), `body`, `latitude`, `longitude`, `status`, `raw_payload`, `created_at`, + `company_id`, processing fields (`004`).

- **UQ** parcial: `message_sid` NOT NULL.
- Índices: employee, phone_from, created_at.
- **Append** de filas; processing_status se actualiza.
- Inbound: sí guarda payload (sin `AccountSid` — `sanitizePayload` en repository).
- Outbound bot: `message_sid` suele ser **null** (respuesta TwiML).
- **No** hay historial de estados Twilio por mensaje.

#### `whatsapp_webhook_events` (`073` + lease `074`)

`company_id`, `message_sid`, `event_type`, `payload_hash`, `processing_status`, attempts, lease, `response_body`, errors.

- Idempotencia: `UNIQUE (company_id, message_sid, event_type)`.
- **No** guarda payload completo (solo hash).
- Tipo `STATUS_CALLBACK` previsto en código TypeScript, **sin productor HTTP**.

#### `bot_sessions`

Máquina de estados conversacional (`WAITING_LOCATION`, selección, ausencia, confirmation, COMPLETED/CANCELLED/EXPIRED, …).  
`context_json`, `expires_at`, FKs operation/workday, `session_version`, `last_message_sid` (`073`).

Útil para “qué flujo estaba activo”, no para timeline de pasos.

#### `whatsapp_attendance_notifications` (`011`+)

Recordatorios: type, status (`PENDING`/`SENT`/`FAILED`/`SENT_RECOVERY_REQUIRED`/`SUPERSEDED`), `twilio_message_sid`, attempts, schedule_version.

- Idempotencia por `(operation_id, employee_id, notification_type, schedule_version)`.
- **Último estado de envío interno**, no historial de callbacks Twilio.

#### `audit_logs` (vía `auditService`)

Auditoría de acciones de dominio administrativas — **no** usada como traza de cada mensaje WhatsApp del bot.

### Evaluación vs modelo propuesto

| Propuesta | ¿Existe equivalente? | Recomendación |
|-----------|----------------------|---------------|
| `whatsapp_conversations` | **No** | Crear (agrupa por phone+company o employee+ventana) |
| `whatsapp_messages` | **Sí** | Extender (no duplicar): correlation, template fields, provider status history link |
| `whatsapp_flow_executions` | **No** | Crear (1 por manejo de webhook / reminder) |
| `whatsapp_flow_steps` | **No** | Crear o JSON append-only en execution |
| `whatsapp_flow_candidates` | **No** (solo logs) | Crear — requisito Caso 1 |
| `whatsapp_provider_events` | **Parcial** (`webhook_events` solo inbound claim) | Crear/extender para status callbacks append-only |

---

## 6. Integración actual con Twilio

### Hechos

| Aspecto | Evidencia | Estado |
|---------|-----------|--------|
| Cliente | `twilio` npm en `twilio-outbound.service.ts` | OK |
| Credenciales | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` | env |
| Firma webhook | `TWILIO_VALIDATE_SIGNATURE`, `TWILIO_WEBHOOK_URL` | OK |
| Templates | Content SID + `contentVariables` JSON | Solo outbound proactivo |
| Texto libre outbound API | No — replies son TwiML en respuesta HTTP | Limitación |
| Status callback URL | No implementada en rutas | **GAP CRITICAL** |
| MessageSid inbound | Persistido + idempotente | OK |
| MessageSid outbound template | En notifications | Parcial |
| MessageSid outbound bot | Null | GAP |
| ErrorCode/ErrorMessage Twilio | No persistidos desde callback | GAP |
| Rate limit handling | No específico | RISK |

### Qué se puede recuperar hoy vs se pierde

| Dato | Disponible | Dónde |
|------|------------|-------|
| MessageSid inbound | Sí | messages + webhook_events |
| From/To | Sí | messages |
| Body inbound | Sí | messages.body |
| Lat/Lng | Sí | messages (+ attendance) |
| Respuesta texto bot | Sí | OUTBOUND body / webhook response_body |
| Content SID reminder | Implícito por tipo + env | no por fila de mensaje unificado |
| Template variables | No persistidas | solo en momento de envío |
| delivered/read/failed | **No** | — |
| ErrorCode Twilio | **No** (salvo error_message interno en notification FAILED) | parcial |

---

## 7. Logging y trazabilidad actual

### Mecanismos

| Mecanismo | Evidencia | Clasificación |
|-----------|-----------|---------------|
| `morgan("dev")` | `app.ts` | útil técnico HTTP, sin correlación negocio |
| `console.info/error/warn` | whatsapp-bot, company-context, reminders, diagnosis | **parcialmente útil**; no consultable por UI; efímero en Docker |
| Masked phone | `maskPhoneNumberForLog` en company-context | bueno |
| Diagnosis candidates | `employee-workday-availability.service` + `whatsapp-bot` `candidateRejections` | **útil pero solo log** |
| `setTechnicalDetail` | bot-runtime-context (simulador) | útil en sim; no prod DB |
| Sentry/OTel/Datadog | ausentes en package.json / env | N/A |
| audit_logs | acciones admin | insuficiente para chat |

### Qué se puede reconstruir hoy

- Lista aproximada de mensajes por teléfono/empleado/fecha (`whatsapp_messages`).
- Sesiones activas/históricas (`bot_sessions`).
- Si un MessageSid se reprocesó (`webhook_events`).
- Si un recordatorio se intentó/envió/falló (`attendance_notifications`).
- Attendance creada con `sourceMessageSid` (vínculo parcial).

### Qué **no** se puede reconstruir

- Timeline de pasos de decisión con motivos.
- Lista de jornadas candidatas y por qué se descartó cada una (post-facto desde DB).
- Cadena delivered/failed de Twilio.
- Conversación unificada inbound + templates.
- correlation/request/trace IDs de punta a punta.
- Versión desplegada ligada al evento (no observada en traza WhatsApp).

---

## 8. Correlación e idempotencia

### Identificadores

| ID | Existe | Propagación | Logs | DB |
|----|--------|-------------|------|-----|
| MessageSid | Sí | webhook → claim → messages | Sí | Sí |
| webhook event id | Sí | claim interno | Poco | Sí |
| bot_session.id | Sí | flujos multi-paso | Parcial | Sí |
| conversation_id | **No** | — | — | — |
| correlation_id / causation_id | **No** (salvo genérico SQL rollback opcional) | — | — | — |
| request_id / trace_id HTTP | **No** en path WhatsApp | — | — | — |
| attendance.sourceMessageSid | Sí | check-in | — | Sí |
| notification.twilio_message_sid | Sí | reminders | Sí | Sí |

### Idempotencia (hechos)

| Superficie | Mecanismo | Riesgo residual |
|------------|-----------|-----------------|
| Webhook inbound | claim + hash anomaly | payload distinto mismo SID → ANOMALY |
| messages | UQ message_sid | OUTBOUND null sid no cubierto |
| Reminders | UQ + claim attempt | OK diseño |
| Attendance | sourceMessageSid | OK |
| Status callbacks | **N/A** | cuando se agreguen: orden fuera de secuencia |

### Riesgos de concurrencia

- Webhook IN_PROGRESS vs retry Twilio.
- Reminder claim multi-instancia (ya mitigado con UQ/claim).
- Callback futuro vs markSent (diseñar append-only events).

---

## 9. Seguridad y control de acceso

### Superadmin (hecho)

- Flag: `users.is_platform_admin` (`016_platform_superadmin.sql`).
- Guard: `requirePlatformAdmin` → `PLATFORM_ADMIN_REQUIRED` (`middleware/require-platform-admin.ts`).
- API existente: `/api/platform/companies` (`platform-company.routes.ts`).
- Frontend: `FeatureRouteGuard requirePlatformAdmin`, ruta `/platform/companies`.
- **No** existe rol de compañía `SUPERADMIN` (rechazado por enums).

### Datos sensibles actuales

| Dato | Dónde | Riesgo panel |
|------|-------|--------------|
| Teléfono completo | `whatsapp_messages.phone_*`, sessions | enmascarar en listados |
| Body mensaje | messages | visible solo detalle auditado |
| Lat/Lng | messages + attendance | restringir / redondear |
| raw_payload | messages | sanitizar; nunca AccountSid (ya se borra) |
| Auth token Twilio | env only | no exponer |
| Stack traces | console.error | sanitizar en API |

### Viabilidad rutas

```text
/api/superadmin/observability/whatsapp/...
```

o preferible alinear con patrón existente:

```text
/api/platform/observability/whatsapp/...
```

protegidas con `authenticate` + `requirePlatformAdmin`.  
**Obligatorio:** validación backend del flag; no confiar solo en frontend.  
**Recomendado:** `audit_logs` por cada acceso a detalle de conversación.

---

## 10. Frontend y reutilización

### Existe

- Platform layout/nav para `isPlatformAdmin`.
- `DataTable`, `FilterBar`, `PaginationControls`, URL table state.
- `ResponsiveModal` (no drawer genérico de detalle).
- Bot simulator: `BotConversationPanel`, `ChatBubble` — **patrón visual de chat**, no datos de producción.

### No existe

- Inbox WhatsApp producción.
- Timeline de decisiones / JSON viewer compartido.
- Página de errores agregados WhatsApp.
- Integración Sentry UI.

### Ubicación sugerida (recomendación)

- Ruta UI: `/platform/observability/whatsapp` (junto a empresas de plataforma).
- Reutilizar DataTable + panel detalle (modal o página split).
- Chat bubble del simulador como inspiración, no acoplar al store del simulador.

---

## 11. Matriz de brechas

| Requisito | Estado actual | Evidencia | Brecha | Severidad |
|-----------|---------------|-----------|--------|-----------|
| Reconstruir conversación completa | Parcial | `whatsapp_messages` | Sin conversation_id; outbound SID null; reminders fuera | HIGH |
| Ver decisión del bot (por qué) | Insuficiente | diagnosis solo console | Persistir executions/candidates | **CRITICAL** |
| Candidatos descartados | Log only | `whatsapp-bot` / availability service | Tabla o JSON durable | **CRITICAL** |
| Estados Twilio delivery | Ausente | sin status route | Webhook status + provider_events | **CRITICAL** |
| Caso recordatorio no recibido | Parcial | notifications SENT + SID | Sin delivered/failed provider | HIGH |
| Idempotencia webhook visible | Parcial | webhook_events | UI + API | MEDIUM |
| Multiempresa | Parcial | company-context logs | Persistir resolution outcome | HIGH |
| Correlation IDs | Ausente | — | Introducir correlation_id | HIGH |
| Panel SUPERADMIN | Patrón listo | platform admin | Endpoints + UI nuevos | MEDIUM |
| Observabilidad externa APM | Ausente | no Sentry/OTel | Opcional Fase 7 | LOW |
| Retención / PII | Ausente | teléfonos/coords en claro | Política + masking | HIGH |
| Traza no bloqueante | N/A diseño futuro | — | Async write / try/catch | HIGH (diseño) |

---

## 12. Riesgos técnicos

1. **Pérdida de trazabilidad** — hoy los “porqués” mueren en Docker logs.
2. **Duplicados** — outbound sin SID; callbacks futuros sin append-only.
3. **Callbacks fuera de orden** — hay que modelar historial, no overwrite ciego.
4. **Datos sensibles** — body + geo + phone en DB ya; el panel amplifica exposición.
5. **Crecimiento de tablas** — cada webhook + N candidates → retención obligatoria.
6. **Impacto en flujo principal** — traza síncrona puede aumentar latencia TwiML.
7. **Fallo de observabilidad** — no debe impedir responder al usuario.
8. **Consistencia** — attendance commit vs traza: eventual consistency aceptable para steps; claim debe seguir atómico.
9. **Compatibilidad** — no romper claim idempotente ni TwiML contract.
10. **Falsa seguridad** — UI hidden sin `requirePlatformAdmin` en API.

---

## 13. Modelo de datos recomendado

### Crítica al modelo propuesto

El modelo de 6 tablas es **razonable**, con ajustes:

1. **Reutilizar `whatsapp_messages`** en lugar de crear otra tabla de mensajes paralela (evitar dual-write).
2. **`whatsapp_provider_events` append-only** es obligatorio (no solo último status en messages).
3. **`whatsapp_flow_candidates`** es el gap #1 para el caso de negocio principal.
4. Conversations pueden ser **lazy**: crear al primer mensaje o vista materializada por `(company_id, phone_normalized, day)`.
5. `phone_hash` + `phone_masked` sí; evitar listar E.164 completo en índices de UI.
6. Steps pueden empezar como `metadata_json` en execution (Fase 1) y normalizarse después.

### Diagrama de relaciones (propuesto)

```text
whatsapp_conversations 1──* whatsapp_messages (extendida)
         │                      │
         │                      └──* whatsapp_provider_events
         │
         └──* whatsapp_flow_executions 1──* whatsapp_flow_steps
                    │
                    └──* whatsapp_flow_candidates

whatsapp_attendance_notifications ──(link)──> flow_execution / message (opc.)
bot_sessions ──(link)──> flow_execution.session_id
```

### Índices sugeridos

- conversations: `(company_id, last_activity_at DESC)`, `(employee_id, last_activity_at)`
- messages: existente + `(conversation_id, created_at)`, `(correlation_id)`
- provider_events: `(provider_message_sid, received_at)`, UNIQUE provider_event_id si Twilio lo da
- flow_executions: `(company_id, started_at)`, `(result_code, started_at)`, `(employee_id, started_at)`

### Retención (recomendación)

- Messages/events: 90–180 días caliente; archive/cold después.
- Candidates: 30–90 días (volumen alto).
- Accesos panel: audit_logs 1 año.

---

## 14. API recomendada

Alinear con patrón existente: **`/api/platform/observability/whatsapp`** + `requirePlatformAdmin`.

| Endpoint | Filtros | Paginación | Respuesta | Permisos | Sensibles |
|----------|---------|------------|-----------|----------|-----------|
| `GET .../conversations` | phone_masked, employeeId, companyId, from/to, hasError, flowType | cursor/limit | list summary | platform admin | phone masked |
| `GET .../conversations/:id` | — | — | header + last messages meta | platform admin | audit access |
| `GET .../conversations/:id/messages` | direction, type | page | chat timeline | platform admin | body/geo gated |
| `GET .../messages/:id` | — | — | message + provider events | platform admin | raw_payload opt-in |
| `GET .../flows/:id` | — | — | execution + steps + candidates | platform admin | snapshots |
| `GET .../errors` | code, company, from/to | page | aggregations | platform admin | — |
| `GET .../errors/:code` | — | — | samples | platform admin | redact |
| `GET .../notifications/:id` | — | — | reminder + SID + attempts | platform admin | — |

**No** exponer docker logs ni AuthToken.

---

## 15. Propuesta de interfaz

1. **Listado conversaciones** — DataTable + FilterBar (empresa, teléfono enmascarado, empleado, rango fechas, result_code, “con error”).
2. **Detalle** — split view: chat (inbound/outbound/templates) + timeline de `flow_executions`.
3. **Timeline decisiones** — pasos ordenados con reason_code badges.
4. **Candidatos** — tabla accepted/rejected + reason_detail.
5. **Twilio** — panel MessageSid + historial provider_events.
6. **Errores** — agrupación por `result_code` / `provider_error_code`.
7. **Estados visuales** — badges SENT/DELIVERED/FAILED/SUPERSEDED coherentes con dominio.

---

## 16. Plan de implementación por fases

### Fase 0 — Contratos y diseño
- Alcance: ADR, contratos TS, privacy policy, naming `/api/platform/...`.
- Migraciones: no.
- DoD: documento aprobado + threat model PII.
- Rollback: N/A.

### Fase 1 — Correlación mínima (segura)
- Alcance: generar `correlation_id` por webhook/reminder; propagar a logs estructurados; link opcional session/notification.
- Archivos: whatsapp-bot, reminder service, logger helper.
- Migraciones: columnas nullable en messages/notifications si hace falta.
- Pruebas: unit correlation propagation.
- **No bloquea respuesta** si falla log.
- DoD: un MessageSid inbound aparece con correlation en logs + DB message row.

### Fase 2 — Persistencia mensajes/estados Twilio
- Alcance: status callback route + `whatsapp_provider_events`; actualizar status proyectado en message.
- Migraciones: sí.
- Pruebas: callback order, duplicates.
- DoD: Caso 2 parcialmente visible (delivered/failed).

### Fase 3 — Decisiones y candidatos
- Alcance: `flow_executions` + `flow_candidates` escritos desde availability diagnosis y router result codes.
- Migraciones: sí.
- DoD: Caso 1 respondible desde API (sin docker).
- Riesgo: volumen — sampling o truncate detail.

### Fase 4 — API platform observability
- Alcance: endpoints list/detail; `requirePlatformAdmin`; audit_logs on read.
- DoD: curl con platform admin OK; company admin 403.

### Fase 5 — Panel conversaciones
- Alcance: UI `/platform/observability/whatsapp`.
- Reutiliza DataTable/FilterBar; detalle chat+timeline.
- DoD: SUPERADMIN ve conversación real de staging.

### Fase 6 — Errores y métricas
- Alcance: aggregations, top reason_codes, reminder failure dashboard.
- DoD: Caso 2/5 operables.

### Fase 7 — Hardening
- Alcance: retención, masking, opt-in raw payload, rate limit panel, opcional Sentry link by correlation.
- DoD: checklist seguridad cerrado.

---

## 17. Estrategia de pruebas

| Tipo | Qué |
|------|-----|
| Unit | intent → result_code mapping; candidate serialization; masking |
| Integration | webhook claim + message + execution insert |
| Webhook | signature fail, duplicate SID, anomaly hash |
| Callbacks | delivered after failed, out-of-order |
| Idempotencia | double webhook, double reminder claim |
| Concurrencia | two workers reminder |
| Multiempresa | ambiguous phone resolution recorded |
| Multijornada | candidates persisted |
| Permisos | platform admin vs company OWNER |
| Sanitización | no token in API JSON |
| Volumen | N candidates × M webhooks/day estimate |
| Regresión bot | suite whatsapp-router + webhook integration existente |

---

## 18. Recomendación final

### 1. ¿Puede implementarse el panel sobre la arquitectura actual?

**Sí**, de forma incremental. La base (messages, sessions, webhook claims, notifications, platform admin) es sólida. Falta la capa de **trazabilidad de decisión** y **callbacks Twilio**.

### 2. ¿Qué debe resolverse antes?

1. Status callbacks Twilio (o aceptar que delivery no estará en v1 — pero documentarlo como limitación).
2. Persistencia de `flow_execution` + candidatos (Caso 1).
3. `correlation_id` mínimo.
4. Política PII + `requirePlatformAdmin` en todas las rutas.

### 3. ¿Qué puede reutilizarse?

- `whatsapp_messages`, `whatsapp_webhook_events`, `bot_sessions`, `whatsapp_attendance_notifications`.
- `requirePlatformAdmin` + UI `/platform/*`.
- Diagnosis ya calculada en `diagnoseCheckInUnavailability` (hoy solo log).
- Design system tablas/filtros; inspiración chat del bot simulator.

### 4. ¿Qué componentes deben crearse?

- Conversations (o proyección).
- Flow executions / candidates / provider events.
- API platform observability.
- UI panel.
- Writer de traza **no bloqueante**.

### 5. ¿Cuál es la primera fase segura?

**Fase 1 (correlación + logs estructurados + hook para persistir diagnosis sin UI)** — bajo riesgo, valor inmediato en soporte vía SQL/logs, no cambia contrato Twilio.

Alternativa si el negocio prioriza Caso 1: **Fase 1 + slice mínimo de Fase 3** (persistir candidates al fallar check-in).

### 6. ¿Qué riesgos impedirían considerar la implementación cerrada?

- Seguir sin poder ver candidatos/motivos en DB.
- Seguir sin historial de estados Twilio (si el requisito incluye “no lo recibió”).
- Panel sin enforcement backend platform admin.
- Traza síncrona que degrade o rompa el webhook.
- Exfiltración de geo/teléfonos/raw payloads sin auditoría.

---

## Checklist de auditoría (resumen)

| Ítem | Marca |
|------|-------|
| Requirements coverage | GAP (panel no existe; base parcial) |
| Backend thin routes / services | OK |
| Repository isolation | OK |
| Migrations style | OK (futuras additive) |
| Idempotency MessageSid | OK inbound |
| Status callbacks | **GAP** |
| Decision evidence | **GAP** |
| Frontend Spanish / permissions pattern | OK reutilizable |
| Security platform admin | OK pattern; panel N/A |
| External APM | N/A |
| Secrets in logs | RISK parcial (revisar payloads) |

---

## Suggested next command

`/implement-dinamic-stage` — **solo después** de aprobar Fase 0/1 de este informe (contratos + correlación + persistencia mínima de diagnosis).

No ejecutar implementación hasta decisión explícita de fase y política PII.

---

## Apéndice: respuestas típicas “sin jornada / sin trabajos” (evidencia)

| Mensaje | Constante | Archivo |
|---------|-----------|---------|
| No tenés jornada para llegada | `NO_OPERATION_MESSAGE` | `bot-response.builder.ts` |
| Empleado no encontrado | `UNKNOWN_EMPLOYEE_MESSAGE` | idem |
| Empresa ambigua | `AMBIGUOUS_COMPANY_MESSAGE` | idem |
| Sin trabajos hoy | `NO_TODAY_ASSIGNMENTS_MESSAGE` | `employee-assignment-format.ts` |
| Sin próximos | `NO_UPCOMING_ASSIGNMENTS_MESSAGE` | idem |
| Jornada ya no disponible | `WORKDAY_NO_LONGER_AVAILABLE_MESSAGE` | `bot-response.builder.ts` |

Condiciones de “no jornada” para llegada se evalúan en `employee-workday-availability.service` + `whatsappBotService.startCheckIn` (diagnosis con `reasonCodes` / `candidateRejections` — **solo log** hoy).

---

*Fin del informe de auditoría. Hechos citados contra el código del repo `dinamic-localizador` a la fecha indicada.*
