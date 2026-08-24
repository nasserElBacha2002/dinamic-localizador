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
