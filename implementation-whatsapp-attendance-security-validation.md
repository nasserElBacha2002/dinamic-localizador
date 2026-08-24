# Implementation validation — WhatsApp attendance security

**Status:** IMPLEMENTED_AND_VALIDATED (Caso A P0 + Caso B observability)  
**Date:** 2026-08-24  
**Scope:** Evidence-based fix from `audit/whatsapp-attendance-incident-audit.md`

---

## ROOT-1 — Forwarded location (P0)

### How forwarded is detected

`extractLocationMessageMetadata` (`backend/src/utils/location-message-metadata.ts`) probes Twilio webhook payloads (Zod `.passthrough()` preserved fields) for:

- Top-level candidates: `Forwarded`, `FrequentlyForwarded`, and Meta/snake_case aliases
- JSON blobs: `ChannelMetadata` / `context` with Meta-style `{ forwarded, frequently_forwarded }`

Boolean parsing is explicit (`true`/`false`/`1`/`0`/…). Unknown strings do not invent a boolean.

### What metadata is actually available

| Signal | Status |
| ------ | ------ |
| Twilio documents a single proven field in this repo | **NO DEMOSTRADO** — no production payload fixture with forward flags yet |
| Schema allows optional `Forwarded` / `FrequentlyForwarded` / `ChannelMetadata` + passthrough | Implemented |
| `whatsapp_messages.raw_payload` still stores inbound JSON (minus AccountSid scrubbing as before) | Reused; **no migration** |

### When metadata is absent

- `isForwarded = null`, `forwardDetection = UNKNOWN`
- **Fail-open:** existing productive routing continues (direct location / Llegué / checkout)
- Structured log: `LOCATION_FORWARD_STATUS` with `forwardDetection: "UNKNOWN"`
- Residual risk documented: historical pins without provider forward flags can still pass

### Where it is blocked

Central gate in `whatsappRouterService.routeLocationMessage` **before**:

- geofence
- `processDirectLocationAttendance`
- `processLocationCheckIn` / `processLocationCheckout`

On explicit forward: `FORWARDED_LOCATION_REJECTED` result code + Spanish bot message; **no attendance insert**.

### Tests (P0)

| Case | Coverage |
| ---- | -------- |
| A forwarded + geofence coords → no attendance | router unit: Forwarded direct path |
| B forwarded + WAITING_LOCATION | router unit |
| C forwarded + checkout session | router unit |
| D forwarded near site (24m-style coords) | router unit |
| E normal location continues | existing + UNKNOWN fail-open test |
| F outside geofence | unchanged deeper flows (not reimplemented) |
| G MessageSid idempotency | unchanged webhook claim layer (not replaced) |
| H new MessageSid + forward still rejected | router unit (`FrequentlyForwarded`) |
| I unknown metadata → UNKNOWN + allow | metadata + router tests |
| Text/maps URL does not register attendance | router text regression |

---

## Caso B — Observability only (NO producer deletion)

### What was added

- Structured logs: `WHATSAPP_NOTIFICATION_SENT` / `WHATSAPP_NOTIFICATION_FAILED` with `producer`, `notificationType`, `templateSid`, `providerMessageSid`, vars, attempt, ids
- Producers labeled: `ATTENDANCE_REMINDER_JOB`, `ASSIGNMENT_NOTIFICATION_WORKER`, `BOT_CHECK_IN`, `BOT_CHECK_OUT`
- Startup warn: `TWILIO_CONTENT_SID_COLLISION` if Content SIDs accidentally equal (does not block boot)
- Contract tests strengthened for 3-var / 4-var builders; `serviceRef` must not contain time/date
- Forensics checklist: `audit/whatsapp-content-template-forensics.md`
- Read-only SQL: `audit/sql/whatsapp-notification-incident-forensics.sql`
- Copy: “✅ Asistencia confirmada.” → “✅ Participación confirmada.” (not physical check-in)

### Producers that still exist (intentionally)

- ARRIVAL_REMINDER_15_MIN
- EXIT_REMINDER_15_MIN
- NO_CHECKIN_AT_START
- ATTENDANCE_CONFIRMATION_REMINDER
- EVENTUAL_OPERATION_ASSIGNED
- BOT confirmation TwiML / check-in/out freeform

### Content SIDs

Configured via env; collision detection at startup. Whether production SIDs are equal remains **environment-specific / NO DEMOSTRADO** without runtime env values.

### Still NO DEMOSTRADO

- Exact producer of the two similar outbound screenshots from the incident
- Whether Twilio always sends `Forwarded` on WhatsApp location forwards in this account
- Whether Meta template bodies match backend var semantics until Console checklist is completed

**No reminder/job/window was disabled based on the capture alone.**

---

## Regression confirmation

| Flow | Status |
| ---- | ------ |
| Ubicación normal → routing works | PASS (unit) |
| Ubicación directa → still routed | PASS (unit) |
| “Llegué” + ubicación → session path intact | PASS (unit; gate only on LOCATION) |
| Checkout location path | PASS (unit; forward rejected before handler) |
| MessageSid inbound dedup | Unchanged layer |
| Reminder job / assignment worker | Still active; only logging + SID warn added |
| No Maps/text coordinates for attendance | PASS (regression test) |

### Commands run

```text
cd backend && npx tsx --test \
  src/utils/location-message-metadata.test.ts \
  src/utils/whatsapp-notification-observability.test.ts \
  src/utils/attendance-reminder-template.test.ts \
  src/utils/operation-assignment-notification/assigned-template-variables.test.ts \
  src/services/whatsapp-router/whatsapp-router.service.test.ts
→ 99 pass / 0 fail

cd backend && npm run build   → OK
cd backend && npm run lint    → OK
```

Migrations: **none** (raw_payload + structured logs sufficient for first correction).

---

## Residual risks

1. Without provider forward flags, forwarded pins remain possible (**fail-open by design**).
2. Caso B root cause still requires DB + Twilio Console forensics using the new artifacts.
3. Confirm Twilio field names in staging by sampling `LOCATION_FORWARD_STATUS.signalKeysFound` / `raw_payload` keys.
