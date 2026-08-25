# Admin Alerts — WhatsApp Audit & Design

> **Update (2026-08-25):** el tipo `FORWARDED_LOCATION_REJECTED` y su productor fueron **retirados** del código de aplicación. El CHECK SQL histórico puede seguir listando el valor como legacy. Ver `audit/whatsapp-forwarded-location-audit.md`.

**Stage audited:** BOT — Alertas a administradores por compañía  
**Mode:** Read-only audit (no code changes)  
**Date:** 2026-08-24  
**Repository:** `dinamic-localizador`

---

## 1. Executive Summary

- **No existe hoy un subsistema de alertas a administradores.** Todo el WhatsApp outbound va a **colaboradores (employees)** vía templates aprobados o TwiML bot. Los admins ven eventos de forma **pasiva** en el panel web.
- La infraestructura reutilizable es sólida: `twilioOutboundService`, outboxes con deduplicación, workers periódicos, `whatsapp_messages`, status callbacks y observabilidad. El patrón a copiar es el de `attendance-reminder` / `operation-assignment-notification` / `payroll-receipt-notification`.
- **Gap crítico:** los **users** (admins web) **no tienen teléfono**. Los teléfonos WhatsApp viven en `employees.phone_number`. Sin resolver destinatarios, no hay alertas admin por WhatsApp.
- **Templates existentes (6) no son reutilizables** para admins: están diseñados para recordatorios/asignaciones/recibos al colaborador, con contratos de variables distintos y copy específico.
- **Cantidad mínima razonable para producción: 2 templates nuevos** (`admin_operational_alert` + `admin_request_alert`). Un template universal es frágil; uno por evento sería ~8–10 templates innecesarios.
- **V1 recomendado:** infraestructura central + 3 alertas críticas (no asistirá, operación sin fichaje comprobable, ubicación reenviada) + solicitudes pendientes. Threshold de asistencia y botones → fases posteriores.
- `absence-review.service.ts` documenta explícitamente que las notificaciones WhatsApp proactivas están **diferidas** — este stage encaja ahí.

---

## 2. Arquitectura actual

```
Inbound WhatsApp (empleado)
  POST /api/webhooks/twilio/whatsapp
    → validate-twilio-signature
    → whatsappWebhookEventRepository.claimInboundMessage (MessageSid dedup)
    → whatsapp-bot.service → whatsapp-router/* handlers
    → bot-outbound-response (TwiML HTTP 200, texto libre)

Outbound WhatsApp proactivo (empleado)
  Domain event / job tick
    → outbox table (claim + lease + retry)
    → twilioOutboundService.sendWhatsAppTemplate(contentSid, contentVariables)
    → whatsapp_messages + provider status callback
    → POST /api/webhooks/twilio/whatsapp/status

Outbound documento (empleado, bot)
  payroll-receipt-whatsapp-delivery.service
    → twilioOutboundService.sendWhatsAppDocument (PDF recibo)
```

**Punto central outbound:** `backend/src/services/twilio-outbound.service.ts`  
Funciones: `sendWhatsAppTemplate`, `sendWhatsAppDocument`, `sendWhatsAppText` (**sin callers en producción**).

**Anti-patrón a evitar:** llamadas dispersas a Twilio desde cada service. Hoy ya está relativamente centralizado en outbox+worker por dominio. Para admin alerts conviene **un solo `AdminAlertService`** + **un worker**.

---

## 3. Infraestructura WhatsApp actual

### 3.1 Envío

| Componente | Archivo | Rol |
|-----------|---------|-----|
| Cliente Twilio | `twilio-outbound.service.ts` | REST `messages.create` |
| Formato teléfono | `utils/whatsapp-phone.ts` | `whatsapp:+E164` |
| Firma webhook | `middleware/validate-twilio-signature.ts` | HMAC inbound/status |
| Status delivery | `services/whatsapp-flow-trace.service.ts` | Proyecta estados Twilio |
| Observabilidad | `utils/whatsapp-notification-observability.ts` | Logs estructurados |
| Collision check | `utils/whatsapp-notification-observability.ts` → `warnOnDuplicateTwilioContentSids()` | Startup |

### 3.2 Workers / jobs (mensajería)

| Job | Intervalo | Env gate | Servicio |
|-----|-----------|----------|----------|
| `attendance-reminder.job.ts` | 60s | `ATTENDANCE_REMINDER_JOB_ENABLED` | Recordatorios asistencia |
| `payroll-receipt-notification.job.ts` | 60s | `PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED` (default true) | Aviso recibo |
| `operation-assignment-notification.job.ts` | 60s | `OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED` (**default false**) | Asignación ONE_TIME |
| `whatsapp-observability-cleanup.job.ts` | 6h | `WHATSAPP_OBSERVABILITY_CLEANUP_JOB_ENABLED` | Retención |

Arranque: `backend/src/server.ts`.

### 3.3 Persistencia

| Tabla | Propósito |
|-------|-----------|
| `whatsapp_messages` | Todos INBOUND/OUTBOUND; `UQ` en `message_sid` |
| `whatsapp_attendance_notifications` | Outbox recordatorios; dedup `(operation_id, employee_id, notification_type, schedule_version)` |
| `whatsapp_payroll_receipt_notifications` | Outbox recibos |
| `whatsapp_operation_assignment_notifications` | Outbox asignaciones |
| `whatsapp_webhook_events` | Claim durable inbound |
| `whatsapp_provider_events` | Status callbacks |
| `whatsapp_conversations` / `whatsapp_flow_executions` | Observabilidad |
| `bot_sessions` | Estado bot (no outbound admin) |
| `audit_logs` | Auditoría admin (ausencias); **no** unavailability ni alertas |

### 3.4 Retry / idempotencia (patrones existentes)

- **Outbox claim + lease** + max attempts (3–5) + backoff exponencial.
- **Ambiguous send:** estados `SENT_RECOVERY_REQUIRED`, `RECONCILIATION_REQUIRED` — no reenvío automático ciego.
- **Twilio classifier:** `utils/twilio-error-classifier.ts` respeta `Retry-After`.
- **Inbound dedup:** `claimInboundMessage()` por MessageSid + hash payload.
- **Status dedup:** `buildProviderEventKey(messageSid, status)`.

---

## 4. Templates existentes

### 4.1 Inventario completo outbound

| Flujo | Archivo/módulo | Destinatario | Template lógico | Content SID / env | Variables | Trigger |
| ----- | -------------- | ------------ | --------------- | ----------------- | --------- | ------- |
| Llegada 15 min | `attendance-reminder.service.ts` | Empleado | `ARRIVAL_REMINDER_15_MIN` | `TWILIO_ARRIVAL_REMINDER_CONTENT_SID` | `{{1}}` nombre, `{{2}}` serviceRef, `{{3}}` hora inicio | Job 60s |
| Salida 15 min | same | Empleado | `EXIT_REMINDER_15_MIN` | `TWILIO_EXIT_REMINDER_CONTENT_SID` | `{{1}}` nombre, `{{2}}` serviceRef, `{{3}}` hora fin | Job 60s |
| Sin check-in al inicio | same | Empleado | `NO_CHECKIN_AT_START` | `TWILIO_TEMPLATE_NO_CHECKIN_SID` | `{{1}}` nombre, `{{2}}` serviceRef | Job 60s |
| Confirmación asistencia | same | Empleado | `ATTENDANCE_CONFIRMATION_REMINDER` | `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID` | `{{1}}` nombre, `{{2}}` serviceRef, `{{3}}` fecha, `{{4}}` hora | Job 60s |
| Recibo disponible | `payroll-receipt-notification.service.ts` | Empleado | `PAYROLL_RECEIPT_AVAILABLE` | `TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID` | `{{1}}` MM/YY | Enqueue al asociar recibo |
| Asignación ONE_TIME | `operation-assignment-notification.service.ts` | Empleado | `EVENTUAL_OPERATION_ASSIGNED` | `TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID` | `{{1}}` firstName, `{{2}}` serviceRef, `{{3}}` fecha, `{{4}}` hora | Enqueue al asignar (worker off) |
| PDF recibo (consulta bot) | `payroll-receipt-whatsapp-delivery.service.ts` | Empleado | **Sin template** (document) | N/A | body + mediaUrl | Bot sesión payroll |
| Respuestas bot | `bot/bot-outbound-response.ts` | Empleado | **TwiML freeform** | N/A | Texto libre | Inbound webhook |
| Simulador | `bot-simulator.service.ts` | N/A | N/A | N/A | N/A | UI test (no Twilio) |

**Variable builders:**  
- `utils/attendance-reminder-template.ts`  
- `utils/operation-assignment-notification/assigned-template-variables.ts`  
- `utils/payroll-receipts/available-template-variables.ts`

**Forensics docs:** `audit/whatsapp-content-template-forensics.md`, `audit/whatsapp-content-runtime-mapping.md`

### 4.2 ¿Se pueden reutilizar para admin alerts?

| Template existente | ¿Reutilizable? | Motivo |
|-------------------|----------------|--------|
| ARRIVAL / EXIT / NO_CHECKIN / CONFIRMATION | **No** | Copy orientado al colaborador (“recordatorio de llegada”); variables asumen nombre empleado + serviceRef operativo |
| EVENTUAL_OPERATION_ASSIGNED | **No** | “Te asignaron una operación” — semántica empleado |
| PAYROLL_RECEIPT_AVAILABLE | **No** | Aviso de recibo al empleado |
| TwiML freeform | **No** | Solo respuesta síncrona inbound; admins no inician conversación |
| `sendWhatsAppText()` | **No en V1** | Sin callers; fuera de ventana activa requiere template aprobado igualmente |

**Conclusión:** se necesitan **templates nuevos** para alertas admin proactivas.

---

## 5. Modelo actual de usuarios/admins/compañías

### 5.1 Entidades

| Entidad | Tabla | Identidad | Teléfono |
|---------|-------|-----------|----------|
| Company | `companies` | UUID | N/A |
| User | `users` | email + password | **No existe columna** |
| Membership | `user_company_memberships` | `(user_id, company_id)` unique | N/A |
| Employee | `employees` | `phone_number` E.164 required | **Sí** (WhatsApp bot) |

**Roles company:** `OWNER | ADMIN | HR | SUPERVISOR | OPERATOR | READ_ONLY`  
Definidos en `backend/src/constants/company-permissions.ts`.

### 5.2 ¿Existe “administrador de compañía”?

**Sí, parcialmente:**

| Rol | Etiqueta UI | ¿Admin operativo? | ¿Gestiona usuarios? | ¿Teléfono WhatsApp? |
|-----|-------------|-------------------|---------------------|---------------------|
| **OWNER** | Dueño | Sí (máximo) | Sí (`users:manage`) | No |
| **ADMIN** | Administrador | Sí (casi todo) | **No** | No |
| **HR** | RRHH | Empleados/ausencias/recibos | No | No |
| **SUPERVISOR** | Supervisor | Ops + review asistencia | No | No |
| Platform admin | Superadmin plataforma | Cross-tenant synthetic OWNER | Sí (plataforma) | No |

- **Múltiples ADMIN por compañía:** permitido (no hay unique en `(company_id, role)`).
- **Platform admin (`is_platform_admin`):** no debe recibir alertas operativas de compañías salvo decisión explícita — riesgo cross-tenant y ruido.
- **Preferencias de notificación:** **no existen** (grep sin matches en `notification_preference`, etc.).

### 5.3 Timezone

Resolución: `company_settings.operation_timezone` → `BOT_OPERATION_TIMEZONE` env → `companies.default_timezone`  
(`utils/operation-timezone.ts`).

### 5.4 Implicación para alertas admin

No se puede usar “todos los users ADMIN” directamente sin **agregar un canal de contacto WhatsApp** (teléfono en user o entidad de destinatario). Los employees no representan admins web.

---

## 6. Eventos auditados

### A. Colaborador avisa que no va a asistir

**Comportamiento existente:**
- Flujos: menú `"no puedo asistir"` → `assignment-confirmation.handler.ts`; respuesta `"2"` a reminder → `attendance-confirmation-response.handler.ts`.
- Write path: `employeeWorkdayService.markAssignmentUnavailable()` → `updateConfirmationStatus(..., 'UNAVAILABLE', onlyIfStatusIn)` (CAS).
- **No** emite audit, **no** notifica admin, **no** cambia `employee_workdays.expectation_status`.
- Mensaje al empleado dice que admin puede revisar en panel (`employee-workday.service.ts`).

**Estados:** `operation_assignments.confirmation_status`: `PENDING → CONFIRMED | UNAVAILABLE`.

**Hook alerta V1:** post-`updateConfirmationStatus` cuando `updated === true`.

**Dedup key sugerida:** `unavailable:{companyId}:{assignmentId}:{unavailable_at|schedule_version}`

**Riesgo duplicados:** bajo (idempotente si ya UNAVAILABLE); medio en race (CAS resuelve).

**Copy alerta (hechos comprobables):**
> Juan Pérez informó que no asistirá a [operación/servicio] el [fecha/hora].

---

### B. Solicitud de vacaciones / ausencias

**Comportamiento existente:**
- Entidad: `absence_requests` — estados `PENDING | NEEDS_INFO | APPROVED | REJECTED | CANCELLED`.
- Creación WhatsApp: `absence-bot.service.ts` → `absenceRequestService.createFromWhatsapp`.
- Creación admin: `createFromAdmin`.
- Review: `absence-review.service.ts` — acciones APPROVE/REJECT/NEEDS_INFO/CANCEL.
- Comentario explícito línea 155: *"Proactive WhatsApp notifications are intentionally deferred to a later phase."*
- Auto-approve si tipo no requiere aprobación.
- Post-approve: pipeline async `absence-workday-sync.job` → reconciliation → conflictos operacionales (`absence-operational-reconciliation.service.ts`).

**Hook alerta V1:**
- `PENDING` creado vía WhatsApp (post-commit en `createRequest` cuando `!autoApproved`).
- Conflictos `CRITICAL`/`WARNING` al aprobar (`absence-operational-reconciliation.service.ts`).

**¿Vacaciones y otras ausencias mismo template?** **Sí** — mismo flujo `absence_requests`; diferenciar con variable `tipo_solicitud` (nombre del `absence_type`).

**Dedup:** `absence-request:{requestId}:pending-alert` (WhatsApp ya dedupe por `sourceMessageSid` en create).

---

### C. Porcentaje de asistencia debajo de umbral

**Comportamiento existente:**
- Fórmula: `presentWorkdays / (presentWorkdays + absentWorkdays)` — `utils/attendance-statistics-metrics.ts`.
- Workdays `EXPECTED` (ventana abierta) **excluidos** del denominador — `utils/employee-workday-statistics-projection.ts`.
- Mínimo muestra: `STATISTICS_MIN_SAMPLE_WORKDAYS = 3` — `constants/statistics.ts`.
- **No hay worker** que evalúe threshold ni envíe alertas. Statistics es **pull-only** vía API/UI.
- Rankings existentes: `low_coverage_operations`, `attention employees` (incident count > 0) — `statistics.repository.ts`.

**Hook propuesto (Fase D, no V1):**
- Job diario/semanal por compañía.
- **Threshold crossing only:** comparar período N vs umbral configurado; alertar solo cuando cruza de arriba→abajo.
- **Cooldown:** `attendance-threshold:{employeeId}:{periodKey}:{thresholdBand}` — no re-alertar 87→86.5→86.

**Clasificación:** **Future / Fase D** — requiere config, job nuevo, diseño anti-spam. No V1.

---

### D. Operación finalizada sin fichaje

**Comportamiento existente:**
- Detección empleado (no admin): `NO_CHECKIN_AT_START` 1 min post-inicio — `attendance-notification.repository.ts`, outbox dedup por `(operation_id, employee_id, notification_type, schedule_version)`.
- Lifecycle operación: `operation-lifecycle.service.ts` + job — promueve a `COMPLETED` cuando `now >= scheduledEnd` (o start + tolerancia si sin fin) — `utils/operation-lifecycle.ts`.
- Post-cierre estadístico: workday pasa a `ABSENT` si no hay attendance — proyección SQL statistics.
- `UNAVAILABLE` en assignment **no** cancela workday expectation automáticamente.

**Regla de copy (obligatoria):**
> No existe registro de llegada para [empleado] en [operación/jornada] del [fecha].

**No afirmar:** “nunca llegó”, “faltó”, “ausente confirmado”.

**Hook V1:** post-promote `COMPLETED` en `operationLifecycleService` cuando workday esperado sin `attendance_records` VALID/PENDING_REVIEW y no `JUSTIFIED`/`CANCELLED`.

**Exclusiones:** ausencia aprobada (`JUSTIFIED`), empleado reemplazado, assignment `UNAVAILABLE` (mensaje distinto o suprimir según regla de negocio).

**Dedup:** `missing-checkin:{employeeWorkdayId}:post-close` — una vez por jornada.

---

### E. Intento de fichaje con ubicación reenviada

**Comportamiento existente:**
- Twilio fields: `Forwarded`, `FrequentlyForwarded` — `utils/location-message-metadata.ts` → `isExplicitlyForwardedLocation()`.
- Rechazo **antes** de geofence: `whatsapp-router.service.ts` ~handleLocationMessage.
- Log: `FORWARDED_LOCATION_REJECTED` — `constants/whatsapp-observability.ts`.
- Mensaje empleado: `FORWARDED_LOCATION_REJECTED_MESSAGE` — `bot-response.builder.ts`.
- **No persiste rechazo en DB** (solo logs/observabilidad).
- Tests: `whatsapp-router.service.test.ts` (anti-forward no es dedup por MessageSid).

**Hook V1:** inmediatamente post-rechazo en router (mismo bloque del log).

**Dedup/throttle:** `forwarded-location:{companyId}:{employeeId}:{hourBucket}` — evitar spam si empleado reintenta.

**¿Incluir geofence REJECTED / PENDING_REVIEW?**
- `PENDING_REVIEW`: **V1 interesante** (ops) — distinto template category (operational).
- `REJECTED` hard outside: **Future** (puede ser ruidoso).
- Múltiples intentos inválidos: **Future** (rate-based).

---

## 7. Gaps encontrados

| # | Gap | Severidad |
|---|-----|-----------|
| G1 | No subsistema admin alerts | Blocker |
| G2 | Users sin teléfono WhatsApp | Blocker |
| G3 | No preferencias/categorías de alerta | High |
| G4 | No templates admin en Twilio | Blocker |
| G5 | `absence-review` deferió WhatsApp proactivo | Info (oportunidad) |
| G6 | Statistics threshold sin worker | Medium (Fase D) |
| G7 | Forward reject solo en logs | Medium |
| G8 | `UNAVAILABLE` assignment no suprime missing-checkin admin | Medium (regla negocio) |
| G9 | `sendWhatsAppText` dead code | Low |
| G10 | Platform admin synthetic OWNER — riesgo si se usa rol como destinatario | High |

---

## 8. Diseño propuesto

### 8.1 Flujo técnico

```
Evento de dominio (service existente)
        ↓
AdminAlertService.emit({ companyId, type, severity, payload, deduplicationKey })
        ↓
Validar: módulo/setting alertas habilitado
        ↓
Resolver destinatarios activos (CompanyAlertRecipient)
        ↓
INSERT outbox (UNIQUE deduplication_key) — skip si duplicate
        ↓
Worker admin-alert.job (60s, patrón existente)
        ↓
Resolver template category → contentSid + variables
        ↓
twilioOutboundService.sendWhatsAppTemplate
        ↓
Persist whatsapp_messages + link outbox → SENT/FAILED
        ↓
Status callback (existente)
```

**No introducir:** event bus, Kafka, RabbitMQ. Un service + outbox + worker es consistente con el repo.

### 8.2 AdminAlertService (nuevo)

Responsabilidades:
- `emit()` — único entry point desde domain services
- Validación tenant (`companyId` siempre explícito)
- Dedup via unique constraint
- No enviar Twilio directamente

**Callers V1 (hooks):**
- `employee-workday.service.ts` — UNAVAILABLE
- `absence-request.service.ts` — PENDING created
- `whatsapp-router.service.ts` — FORWARDED_LOCATION_REJECTED
- `operation-lifecycle.service.ts` — post-COMPLETED missing check-in

---

## 9. Destinatarios

### Comparación de opciones

| Opción | Descripción | Pros | Contras |
|--------|-------------|------|---------|
| A | Todos los `ADMIN`/`OWNER` de la compañía | Simple conceptualmente | **Users sin teléfono**; no granular |
| B | Un solo `Company.adminUserId` | Muy simple | Un solo destinatario; no multi-admin |
| C | **`CompanyAlertRecipient`** | Explícito, multi-admin, categorías, teléfono E.164 | Tabla + UI nueva |
| D | Preferencias genéricas | Flexible | Overengineering V1 |

### Recomendación: **Opción C (minimal)**

```text
company_alert_recipients
  id, company_id, user_id NULL, phone_number NOT NULL,
  display_name, is_enabled,
  receive_operational_alerts BIT,
  receive_request_alerts BIT,
  receive_security_alerts BIT,
  created_at, updated_at
  UNIQUE (company_id, phone_number)
```

- `user_id` opcional — link a user web para gestión UI; **envío siempre a `phone_number`**.
- V1 default: OWNER crea 1–N destinatarios manualmente (teléfono WhatsApp del responsable).
- **No** incluir platform admin automáticamente.
- Roles `ADMIN`/`OWNER`/`HR` pueden ser **sugeridos en UI** al dar de alta destinatario, pero no auto-inscritos.

---

## 10. Persistencia e idempotencia

### Reutilizar vs crear

| Existente | ¿Sirve? |
|-----------|---------|
| `whatsapp_messages` | **Sí** — registro delivery |
| `whatsapp_*_notifications` outboxes | **Patrón a copiar**, no reusar tabla |
| `audit_logs` | **No** — append-only, sin retry/worker |
| `whatsapp_flow_executions` | **No** — orientado a bot empleado |

### Tabla propuesta: `whatsapp_admin_alert_notifications`

Alineada con outboxes existentes:

```text
id, company_id, deduplication_key NVARCHAR(200) NOT NULL,
alert_type NVARCHAR(50), severity NVARCHAR(20),
employee_id NULL, operation_id NULL, absence_request_id NULL,
recipient_id NOT NULL, recipient_phone,
template_category NVARCHAR(30),  -- OPERATIONAL | REQUEST
content_variables_json NVARCHAR(MAX),
status PENDING|SENT|FAILED|SKIPPED,
attempt_count, last_error, provider_message_sid NULL,
occurred_at, sent_at NULL, created_at, updated_at
UNIQUE (company_id, deduplication_key, recipient_id)
```

**Opcional V2:** `admin_alerts` materializada para dashboard/inbox (desacoplada de delivery).

### Claves de deduplicación

| Evento | Key |
|--------|-----|
| No asistirá | `unavailable:{assignmentId}:{scheduleVersion}` |
| Solicitud pending | `absence-pending:{requestId}` |
| Sin fichaje post-cierre | `missing-checkin:{employeeWorkdayId}` |
| Ubicación reenviada | `forwarded:{employeeId}:{dateHour}` (throttle) |
| Threshold crossing | `attendance-threshold:{employeeId}:{period}:{band}` |
| PENDING_REVIEW | `pending-review:{attendanceRecordId}` |

---

## 11. Anti-spam

### Clasificación de eventos

| Evento | Timing | Consolidable |
|--------|--------|--------------|
| No asistirá | **Inmediato** | No |
| Solicitud pending | **Inmediato** | No |
| Ubicación reenviada | **Inmediato** | Throttle 1/h/empleado |
| Sin fichaje post-cierre | **Diferido** (post COMPLETED) | Batch por operación V2 |
| PENDING_REVIEW | Inmediato | No |
| Threshold asistencia | **Job periódico** | Solo crossing + cooldown 7d |
| Conflictos CRITICAL approve | Inmediato | No |

### Reglas V1

- Max **1 WhatsApp por dedup key por destinatario**.
- Forwarded: throttle horario.
- Sin resumen diario en V1 (no justifica template extra).
- Severidad `INFO` → solo dashboard (Fase 2), no WhatsApp.

---

## 12. Seguridad / multi-tenancy

| Riesgo | Mitigación |
|--------|------------|
| Alerta cross-company | `company_id` en outbox; recipients scoped; emit valida employee/request pertenece a company |
| Platform admin recibe todo | Excluir `is_platform_admin` de recipients auto |
| PII en logs | Reutilizar patrón observabilidad (hash teléfono); no loguear contentVariables completos en prod |
| Spoofing forwarded | Alerta admin es informativa; **no** permitir acciones que modifiquen estado sin auth web |
| Botones callback | **Defer V2** — requiere templates quick-reply + handler + permisos |
| Teléfono destinatario | Validar E.164 como employees (`normalizePhoneNumber`) |
| Mensaje afirma hechos falsos | Copy guidelines: solo hechos comprobables (ver evento D) |

---

## 13. WhatsApp Template Analysis

### Alternativa A — 1 template universal

```text
⚠️ {{1}} — {{2}}
{{3}}
{{4}}
```

| Criterio | Evaluación |
|----------|------------|
| Factibilidad técnica | Alta |
| Aprobación Meta | **Riesgo** — demasiado genérico; difícil dar ejemplos concretos |
| UX | Mala — `{{3}}`/`{{4}}` a veces vacíos |
| Mantenibilidad | Lógica condicional backend frágil |

**Veredicto:** no recomendado para producción.

---

### Alternativa B — 2 templates (RECOMENDADA)

1. **`admin_operational_alert`** — anomalías operativas/seguridad  
2. **`admin_request_alert`** — solicitudes que requieren revisión

| Criterio | Evaluación |
|----------|------------|
| Aprobación Meta | Buena — copy claro por categoría |
| Reutilización | Alta dentro de cada categoría |
| Variables | 4 por template, pocas vacías |
| Env vars | Solo 2 SIDs |

**Veredicto:** **mínimo razonable para producción.**

---

### Alternativa C — 3 templates

Separar seguridad (`admin_security_alert`).  
Útil si Meta rechaza mezclar “ubicación reenviada” con “sin fichaje”.  
**Fallback** si Alternativa B no aprueba en un solo template operational.

---

### Alternativa D — 1 evento = 1 template

~8–10 templates: `admin_unavailable`, `admin_absence_request`, `admin_vacation`, `admin_missing_checkin`, `admin_forwarded`, `admin_low_attendance`, `admin_pending_review`, `admin_critical_conflict`, …

**Veredicto:** baseline a evitar. Más aprobaciones, más SIDs, más drift.

---

## 14. Template Consolidation Matrix

| Evento | Template recomendado | Variables | Reutilizable | ¿Template nuevo? | Justificación |
| ------ | -------------------- | --------- | -----------: | ---------------: | ------------- |
| No asistirá | `admin_operational_alert` | tipo, empleado, detalle, contexto | Sí | No (nuevo SID cat. operational) | Mismo shape: hecho operativo + quién + dónde/cuándo |
| Vacaciones / ausencia pending | `admin_request_alert` | tipo, empleado, fechas, estado | Sí | No (nuevo SID cat. request) | Mismo workflow review |
| Sin fichaje (post-cierre) | `admin_operational_alert` | tipo, empleado, detalle, contexto | Sí | No | Copy factual: “no hay registro de llegada” |
| Ubicación reenviada | `admin_operational_alert` | tipo, empleado, detalle, contexto | Sí | No | Alerta seguridad operativa |
| Asistencia baja threshold | `admin_operational_alert` | tipo, empleado, detalle (%), periodo | Sí | No | Fase D |
| PENDING_REVIEW geofence | `admin_operational_alert` | tipo, empleado, detalle, servicio | Sí | No | V1 opcional |
| Conflicto CRITICAL al aprobar | `admin_operational_alert` | tipo, empleado, detalle, operación | Sí | No | V1 opcional |
| NEEDS_INFO ausencia | `admin_request_alert` | tipo, empleado, fechas, nota | Sí | No | Future |

---

## 15. Proposed Template Contents

> Textos propuestos para envío a aprobación Meta/Twilio. Ajustar emojis según política Meta Utility.

### Template 1: `admin_operational_alert`

**Categoría Meta sugerida:** UTILITY  
**Variables:** 4 (todas requeridas; usar "—" si no aplica contexto)

```text
⚠️ {{1}}

Colaborador: {{2}}
{{3}}

{{4}}
```

| Var | Contenido | Ejemplo |
|-----|-----------|---------|
| {{1}} | Tipo de alerta (corto) | `Sin registro de llegada` |
| {{2}} | Nombre empleado | `Juan Pérez` |
| {{3}} | Detalle factual | `No existe registro de llegada al finalizar la jornada.` |
| {{4}} | Contexto operativo | `Operación: Carrefour Caballito · 24/08/2026 08:00` |

**Ejemplos Meta (requeridos en aprobación):**

1. No asistirá: `{{1}}=No asistirá`, `{{3}}=Informó que no podrá asistir.`, `{{4}}=Operación: ... · fecha/hora`
2. Forwarded: `{{1}}=Ubicación reenviada`, `{{3}}=Intentó registrar asistencia con ubicación reenviada.`, `{{4}}=—`
3. Missing check-in: `{{1}}=Sin registro de llegada`, `{{3}}=No existe registro de llegada al cierre.`, `{{4}}=Operación: ...`

**Botones V1:** ninguno.

---

### Template 2: `admin_request_alert`

```text
📋 {{1}}

Colaborador: {{2}}
Período: {{3}}

Estado: {{4}}
```

| Var | Contenido | Ejemplo |
|-----|-----------|---------|
| {{1}} | Tipo solicitud | `Solicitud de vacaciones` |
| {{2}} | Nombre | `Juan Pérez` |
| {{3}} | Rango fechas | `01/09/2026 – 07/09/2026` |
| {{4}} | Estado | `Pendiente de revisión` |

**Ejemplos Meta:**
- Vacaciones pending
- Licencia médica pending

**Botones V1:** ninguno. (V2: "Revisar" → deep link web, no callback WhatsApp.)

---

### Template 3 (solo si Meta exige separar seguridad): `admin_security_alert`

Diferir unless Alternativa B rechazada. Mismo shape que operational con copy orientado a fraude/integridad.

---

### Resumen periódico (NO V1)

No recomendado en V1 — requeriría template #3 adicional con bajo valor si hay poco volumen.

---

## 16. Template Decision

### Templates existentes reutilizables para admin alerts

**0**

(Los 6 existentes son employee-facing; semántica incompatible.)

### Templates nuevos mínimos técnicamente posibles

**1** (universal genérico — frágil)

### Templates nuevos recomendados para producción

**2**

1. **`admin_operational_alert`**
   - **Propósito:** anomalías operativas y seguridad
   - **Eventos:** no asistirá, sin registro de llegada, ubicación reenviada, pending review, threshold (fase D), conflictos
   - **Variables:** {{1}} tipo, {{2}} empleado, {{3}} detalle, {{4}} contexto
   - **Botones:** no (V1)
   - **Content SID requerido:** sí → `TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID`

2. **`admin_request_alert`**
   - **Propósito:** solicitudes que requieren revisión
   - **Eventos:** vacaciones, ausencias pending, future NEEDS_INFO
   - **Variables:** {{1}} tipo, {{2}} empleado, {{3}} período, {{4}} estado
   - **Botones:** no (V1)
   - **Content SID requerido:** sí → `TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID`

### Templates con enfoque ingenuo (1 evento = 1 template)

**~8–10**

### Ahorro

**8 templates / ~80%** vs enfoque ingenuo (10 → 2).

### Respuesta a la pregunta principal

> **¿Cuál es la menor cantidad de templates WhatsApp que podemos mandar a aprobar sin diseñar una solución frágil o excesivamente genérica?**

**2 templates** (`admin_operational_alert` + `admin_request_alert`), con fallback a **3** solo si Meta rechaza mezclar alertas de seguridad con operativas en un solo cuerpo.

---

## 17. Cambios DB

| Objeto | Necesidad | Notas |
|--------|-----------|-------|
| `company_alert_recipients` | **V1** | Destinatarios + flags categoría |
| `whatsapp_admin_alert_notifications` | **V1** | Outbox + dedup |
| `company_settings.admin_alerts_enabled` | **V1** | BIT default 0 |
| `company_settings.admin_alert_attendance_threshold` | Fase D | NULL = disabled |
| `company_settings.admin_alert_cooldown_days` | Fase D | default 7 |
| Índices | `(company_id, status, created_at)` on outbox | worker query |
| UNIQUE | `(company_id, deduplication_key, recipient_id)` | anti-dupe |

**No migrar en esta auditoría.** Compatibilidad: additive only.

---

## 18. Cambios backend

| Archivo / módulo | Cambio |
|------------------|--------|
| `services/admin-alert.service.ts` | **Nuevo** — emit + enqueue |
| `services/admin-alert-delivery.service.ts` | **Nuevo** — worker batch send |
| `repositories/admin-alert-notification.repository.ts` | **Nuevo** |
| `repositories/company-alert-recipient.repository.ts` | **Nuevo** |
| `jobs/admin-alert.job.ts` | **Nuevo** — 60s |
| `config/env.ts` + `.env.example` | 2 Content SIDs + worker flags |
| `employee-workday.service.ts` | Hook emit UNAVAILABLE |
| `absence-request.service.ts` | Hook emit PENDING |
| `whatsapp-router.service.ts` | Hook emit FORWARDED |
| `operation-lifecycle.service.ts` | Hook emit missing check-in |
| `routes/company-alert-recipient.routes.ts` | CRUD destinatarios |
| `schemas/admin-alert.schema.ts` | Validación |

---

## 19. Cambios frontend

| Pantalla | Cambio |
|----------|--------|
| Settings → Alertas WhatsApp | **Nueva** — destinatarios, toggle enable, test send |
| Absences / Operations / Attendance | Sin cambio V1 (alertas son push) |
| V2 opcional | Inbox de alertas históricas |

Permiso sugerido: `company:settings:update` para configurar destinatarios.

---

## 20. Workers/jobs

**Nuevo:** `admin-alert.job.ts`
- Intervalo: 60s (consistente)
- Gate: `ADMIN_ALERT_WORKER_ENABLED` (default false hasta SIDs configurados)
- Batch: 5–10 (como payroll/assignment)
- Lease + retry: copiar de `operation-assignment-notification.service.ts`

**Fase D adicional:** `admin-alert-threshold.job.ts` (daily/weekly).

---

## 21. Tests

### Unit
- `AdminAlertService.emit` — dedup skip, tenant validation
- Template variable builders — 4 vars siempre string non-empty
- Threshold crossing logic (Fase D)

### Integration / HTTP
- CRUD recipients scoped by company
- HR cannot read other company recipients

### DB
- UNIQUE deduplication_key conflict → no second send
- Concurrent worker claims — lease pattern

### Webhook
- Forwarded location → exactly one alert per throttle window

### Worker
- Retry on Twilio 5xx; no duplicate on ambiguous send

### E2E (staging + Twilio sandbox)
- Full path UNAVAILABLE → template sent → status callback SENT

---

## 22. Migraciones

Propuesta (no generada):

1. `NNN_company_alert_recipients.sql`
2. `NNN_whatsapp_admin_alert_notifications.sql`
3. `NNN_company_settings_admin_alerts.sql`

Rollback: drop tables + columns. Sin FK a users estricta (nullable user_id).

---

## 23. Variables de entorno

### Nuevas (propuesta)

```env
# Admin WhatsApp alerts
TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID=
TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID=
ADMIN_ALERT_WORKER_ENABLED=false
ADMIN_ALERT_WORKER_INTERVAL_MS=60000
ADMIN_ALERT_MAX_ATTEMPTS=5
ADMIN_ALERT_RETRY_BASE_MS=30000
ADMIN_ALERT_FORWARDED_THROTTLE_MINUTES=60
```

### Existentes reutilizadas

```env
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER
TWILIO_STATUS_CALLBACK_URL
WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED
```

**Estrategia confirmada:** 2 SIDs agregados, no 8+ por evento.

---

## 24. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Meta rechaza template genérico | Media | Alto | 2 categorías + ejemplos concretos en aprobación |
| Admins no configuran teléfonos | Alta | Alto | Onboarding UI + validación E.164 |
| Spam por forwarded retries | Media | Medio | Throttle horario |
| Missing check-in falsos positivos | Media | Medio | Copy factual; excluir JUSTIFIED/UNAVAILABLE |
| UNAVAILABLE + missing-checkin doble alerta | Media | Medio | Regla: suprimir missing si UNAVAILABLE same workday |
| Worker duplicado multi-instance | Baja | Alto | Lease pattern (existente) |
| Platform admin en recipients | Baja | Alto | No auto-enroll |

---

## 25. Plan incremental

### Fase A — Infraestructura
- Tablas recipients + outbox
- `AdminAlertService` + worker
- 2 templates Twilio aprobados
- UI destinatarios mínima
- Feature flag `ADMIN_ALERT_WORKER_ENABLED=false`

### Fase B — Alertas críticas
- No asistirá (UNAVAILABLE)
- Sin registro de llegada (post COMPLETED)
- Ubicación reenviada (throttled)

### Fase C — Solicitudes
- Ausencia/vacation PENDING vía WhatsApp

### Fase D — Métricas
- Threshold asistencia crossing + cooldown job

### Fase E — Opcional
- Botones / deep links
- Resumen diario (template #3)
- Inbox admin UI
- PENDING_REVIEW push

---

## 26. Archivos afectados estimados

| Área | Archivos nuevos | Archivos modificados |
|------|-----------------|---------------------|
| Backend services | 2–3 | 4 hooks |
| Backend repos | 2 | 0 |
| Backend routes/schemas | 2 | 2 (env, server) |
| Jobs | 1 | 1 (server.ts) |
| Migrations | 2–3 | 0 |
| Frontend | 1 page + API | 1 settings nav |
| Tests | 6–10 | 0 |
| **Total estimado** | **~15–20** | **~8** |

---

## 27. Recomendación final

1. **Implementar alertas admin como outbox+worker**, no como sends dispersos — copiar el patrón probado de `whatsapp_operation_assignment_notifications`.
2. **Aprobar 2 templates WhatsApp** antes de escribir código de producción: `admin_operational_alert` y `admin_request_alert`.
3. **Crear `company_alert_recipients`** — no asumir que users ADMIN tienen teléfono.
4. **V1 scope acotado:** 3 alertas operativas + 1 request; sin threshold, sin botones, sin resumen.
5. **Copy estrictamente factual** en missing check-in — nunca afirmar ausencia real.
6. **Platform admin excluido** de recipients automáticos.
7. **`absence-review.service.ts` ya anticipó este stage** — implementar ahí el hook de solicitudes pending.

**Suggested next command:** `/implement-dinamic-stage` con spec derivada de Fase A+B de este documento.

---

## Audit report

**Status:** `READY_TO_IMPLEMENT`

**Stage audited:** BOT — Alertas a administradores por compañía

**Open questions (blockers before implement):**
1. ¿Los destinatarios serán solo teléfonos libres o debe vincularse obligatoriamente a un User?
2. ¿OWNER y ADMIN reciben por defecto todas las categorías al crear destinatario, o opt-in por categoría?
3. ¿Suprimir alerta “sin registro de llegada” cuando assignment está `UNAVAILABLE` en la misma jornada?
4. ¿HR debe recibir solicitudes pending además de OWNER/ADMIN?

**Suggested next command:** `/implement-dinamic-stage` — Fase A (infra + 2 templates) + Fase B (3 alertas críticas)
