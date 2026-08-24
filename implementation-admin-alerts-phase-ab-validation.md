# Admin Alerts Phase A+B — Validation

## 1. Resumen

Se implementó la infraestructura base de alertas WhatsApp para administradores por compañía (Fase A) y las tres alertas operativas iniciales (Fase B): no asistirá, sin registro de llegada al finalizar jornada, y ubicación reenviada. El envío es durable vía outbox + worker con lease; los servicios de dominio solo llaman `adminAlertService.emit()`.

## 2. Arquitectura implementada

```
Evento dominio → AdminAlertService.emit()
  → validación company + adminAlertsEnabled
  → recipients explícitos filtrados por categoría
  → INSERT outbox (dedupe DB)
Worker admin-alert.job → AdminAlertDeliveryService
  → twilioOutboundService.sendWhatsAppTemplate()
  → whatsapp_messages + status callback existente
```

Patrón alineado con `whatsapp_operation_assignment_notifications` (lease, send attempts, RECONCILIATION_REQUIRED / SENT_RECOVERY_REQUIRED).

## 3. Migraciones

| Migración | Contenido |
|-----------|-----------|
| `100_company_alert_recipients_and_settings.sql` | Tabla `company_alert_recipients`, `company_settings.admin_alerts_enabled` (default 0) |
| `101_whatsapp_admin_alert_notifications.sql` | Outbox `whatsapp_admin_alert_notifications` + `whatsapp_admin_alert_notification_send_attempts` |

## 4. Modelo recipients

- Teléfono E.164 obligatorio, `user_id` opcional
- Unique `(company_id, phone_number)` — mismo teléfono permitido en otra compañía
- Preferencias: `receiveOperationalAlerts` (default true), `receiveRequestAlerts` (false), `receiveSecurityAlerts` (true)
- Sin auto-suscripción por rol OWNER/ADMIN/HR

## 5. Modelo outbox

- Dedupe: `UNIQUE (company_id, deduplication_key, recipient_id)`
- Estados: PENDING, PROCESSING, SEND_STARTED, SEND_ACCEPTED, FAILED, SKIPPED, RECONCILIATION_REQUIRED, SENT_RECOVERY_REQUIRED
- Variables precomputadas en `content_variables_json`

## 6. AdminAlertService

- Entry point único `emit()`
- No llama Twilio
- Idempotente vía constraint DB

## 7. Worker

- `admin-alert.job.ts`, intervalo configurable, batch 8
- `ADMIN_ALERT_WORKER_ENABLED=false` por defecto

## 8. Twilio mapping

| Categoría | Content SID env |
|-----------|-----------------|
| OPERATIONAL, SECURITY | `TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID` |
| REQUEST (preparado) | `TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID` |

## 9. Alertas implementadas

| Tipo | Hook | Dedupe |
|------|------|--------|
| EMPLOYEE_UNAVAILABLE | `employeeWorkdayService.markAssignmentUnavailable` tras CAS exitoso | `unavailable:{assignmentId}:{scheduleVersion}` |
| MISSING_CHECKIN_AFTER_OPERATION | `operationLifecycleService` al promover a COMPLETED | `missing-checkin:{employeeWorkdayId}` |
| FORWARDED_LOCATION_REJECTED | `whatsapp-router.service` tras rechazo forwarded | `forwarded:{employeeId}:{YYYYMMDDHH}` (BOT timezone) |

## 10. Reglas de supresión (missing check-in)

Excluye workdays con `expectation_status != EXPECTED`, assignments `UNAVAILABLE`, y attendance `VALID` o `PENDING_REVIEW`.

## 11. Deduplicación

- DB unique en outbox por recipient
- Re-emisión del mismo evento → `ADMIN_ALERT_DEDUP_SKIPPED`
- Forwarded: bucket horario por empleado/compañía/recipient

## 12. Retry / recovery

- Backoff exponencial (`ADMIN_ALERT_RETRY_BASE_MS`)
- Ambiguous send → RECONCILIATION_REQUIRED (sin reenvío ciego)
- Post-Twilio crash → SENT_RECOVERY_REQUIRED
- Lease expiry → recoverExpiredLeases

## 13. Seguridad multi-tenant

- Todas las queries recipients/outbox filtran `company_id`
- API scoped bajo `/api/companies/:companyId/company-alert-recipients`

## 14. Tests agregados

| Test | Resultado |
|------|-----------|
| `template-variables.test.ts` | 3/3 pass |
| `dedup-keys.test.ts` | 3/3 pass |
| Tests DB / hooks / worker integration | **No ejecutados** (requieren SQL Server en CI/local) |

## 15. Comandos ejecutados

```bash
cd backend && npm run build
cd backend && npx tsx --test src/utils/admin-alert/template-variables.test.ts src/utils/admin-alert/dedup-keys.test.ts
cd frontend && npm run build
```

## 16. Resultados

- Backend build: **pass**
- Frontend build: **pass**
- Unit tests admin-alert utils: **6/6 pass**

## 17. Limitaciones conocidas

- `emit()` post-UNAVAILABLE no está en la misma transacción SQL que el UPDATE de assignment (gap documentado; patrón async fire-and-forget como otros hooks del proyecto).
- Tests de concurrencia DB, worker y hooks de integración pendientes de entorno SQL Server.
- RECURRING missing-check-in: solo ONE_TIME dispara vía lifecycle COMPLETED (coherente con `operation-lifecycle.service` actual).
- Gap transaccional UNAVAILABLE: si el proceso cae entre UPDATE y emit, la alerta puede perderse (mitigación futura: enqueue en misma TX si el repo lo soporta).

## 18. Variables nuevas

```env
TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID=
TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID=
ADMIN_ALERT_WORKER_ENABLED=false
ADMIN_ALERT_WORKER_INTERVAL_MS=60000
ADMIN_ALERT_LEASE_MS=120000
ADMIN_ALERT_MAX_ATTEMPTS=5
ADMIN_ALERT_RETRY_BASE_MS=30000
ADMIN_ALERT_FORWARDED_THROTTLE_MINUTES=60
```

Company setting: `adminAlertsEnabled` (default false).

## 19. Pasos manuales Twilio

1. Crear template `admin_operational_alert`: `⚠️ {{1}}` / Colaborador: `{{2}}` / `{{3}}` / `{{4}}`
2. Crear template `admin_request_alert` (preparado, no usado en Fase B)
3. Copiar Content SIDs a env de producción

## 20. Pasos de rollout

1. Deploy código + migraciones 100–101
2. Configurar recipients en **Configuración → Alertas WhatsApp**
3. Configurar `TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID`
4. `ADMIN_ALERT_WORKER_ENABLED=true`
5. Habilitar `adminAlertsEnabled` por compañía

## 21. Scope explícitamente diferido

- Threshold asistencia, vacaciones/solicitudes (template REQUEST), PENDING_REVIEW push, dashboard/inbox, botones, resumen diario, geofence outside-radius.
