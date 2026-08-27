# WhatsApp Content runtime mapping (Caso B forensics)

**Environment inspected:** local backend `.env` (2026-08-24)  
**Production runtime:** NO DEMOSTRADO

## Content SID configuration (local)

| notificationType | ENV | Configured | Runtime SID | Notes |
| ---------------- | --- | ---------- | ----------- | ----- |
| ARRIVAL_REMINDER_15_MIN | TWILIO_ARRIVAL_REMINDER_CONTENT_SID | no | — | empty |
| EXIT_REMINDER_15_MIN | TWILIO_EXIT_REMINDER_CONTENT_SID | no | — | empty |
| NO_CHECKIN_AT_START | TWILIO_TEMPLATE_NO_CHECKIN_SID | no | — | empty |
| ATTENDANCE_CONFIRMATION_REMINDER | TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID | no | — | empty |
| EVENTUAL_OPERATION_ASSIGNED | TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID | no | — | empty |

**Collisions:** N/A (no SIDs configured locally).  
**Twilio API / Console bodies:** not fetched (no credentials in this environment).

## Backend variable contracts (source of truth in repo)

| Type | Vars |
| ---- | ---- |
| ARRIVAL | 1=nombre, 2=serviceRef, 3=hora |
| EXIT | 1=nombre, 2=serviceRef, 3=hora fin |
| CONFIRMATION | 1=nombre, 2=serviceRef, 3=fecha, 4=hora |
| ASSIGNMENT | 1=firstName, 2=serviceRef, 3=fecha, 4=hora |

`serviceRef` never contains date/time (code + unit tests).

## Admin alert templates (BOT module)

| Template lógico | ENV | Variables | Eventos |
| --------------- | --- | --------- | ------- |
| `admin_operational_alert` | `TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID` | {{1}} título, {{2}} empleado, {{3}} detalle, {{4}} contexto | `EMPLOYEE_UNAVAILABLE`, `MISSING_CHECKIN_AFTER_OPERATION`, `ATTENDANCE_THRESHOLD_CROSSED` |
| `admin_request_alert` | `TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID` | {{1}} tipo solicitud, {{2}} empleado, {{3}} período, {{4}} estado | `ABSENCE_REQUEST_PENDING` (vacaciones, licencia, estudio, trámite, etc.) |

Vacaciones, licencia médica, día de estudio y demás tipos de ausencia con aprobación manual comparten **`admin_request_alert`**. No hay SID por tipo de ausencia.

### Attendance threshold (Phase D)

- Misma fórmula que estadísticas: `present / (present + absent)` (JUSTIFIED / EXPECTED / CANCELLED fuera del rate).
- Solo alerta por **crossing** ABOVE→BELOW (no por permanecer BELOW).
- Feature `attendanceThresholdAlertsEnabled` default **false**; activar hace **baseline**, no backfill.
- Settings: threshold %, window days, minimum workdays, cooldown days.
- Template: `admin_operational_alert` (sin SID nuevo).

Startup: cuando `ADMIN_ALERT_WORKER_ENABLED=true`, se exigen **ambos** SIDs operacional y request.

## Fill when production access is available

| Tipo | Runtime HX… | Body summary (no PII) | {{3}} meaning in body | {{4}} meaning | Collision? |
| ---- | ----------- | --------------------- | --------------------- | ------------- | ---------- |
| ARRIVAL | | | | | |
| CONFIRMATION | | | | | |
| ASSIGNMENT | | | | | |

## Observed defective WhatsApp text (user-provided)

```text
... Tienda Formosa 456 - Buenos Aires - 20:00 comienza a las 24/08/2026
```

Most parsimonious template hypothesis (unconfirmed):

```text
... {{2}} - {{4}} comienza a las {{3}}.
```

with 4-var backend payload (fecha in 3, hora in 4).
