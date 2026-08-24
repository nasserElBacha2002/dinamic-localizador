# WhatsApp Content Template forensics checklist

**Purpose:** Compare backend variable contracts against Twilio Content Template bodies in Console.  
**Scope:** Caso B observability — do **not** disable jobs based on screenshots alone.  
**Bodies:** Live in Twilio Content API / Meta — **not** in this repository. Do not invent snapshot text.

---

## Backend variable contracts (source of truth in code)

| notificationType | ENV | Vars backend | Notes |
| ---------------- | --- | ------------ | ----- |
| `ARRIVAL_REMINDER_15_MIN` | `TWILIO_ARRIVAL_REMINDER_CONTENT_SID` | `{{1}}` nombre, `{{2}}` serviceRef, `{{3}}` **hora** HH:mm inicio | 3 variables |
| `EXIT_REMINDER_15_MIN` | `TWILIO_EXIT_REMINDER_CONTENT_SID` | `{{1}}` nombre, `{{2}}` serviceRef, `{{3}}` **hora** HH:mm fin | 3 variables |
| `NO_CHECKIN_AT_START` | `TWILIO_TEMPLATE_NO_CHECKIN_SID` | `{{1}}` nombre, `{{2}}` serviceRef | 2 variables |
| `ATTENDANCE_CONFIRMATION_REMINDER` | `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID` | `{{1}}` nombre, `{{2}}` serviceRef, `{{3}}` **fecha**, `{{4}}` **hora** | 4 variables |
| `EVENTUAL_OPERATION_ASSIGNED` | `TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID` | `{{1}}` firstName, `{{2}}` serviceRef, `{{3}}` **fecha**, `{{4}}` **hora** | 4 variables |

`serviceRef` = `name - address - locality` (`format-service-reference.ts`). **Backend never puts time inside `{{2}}`.**

Code:

- `backend/src/utils/attendance-reminder-template.ts`
- `backend/src/utils/operation-assignment-notification/assigned-template-variables.ts`

---

## Runtime Content SID checklist

Fill from staging/production env (or startup logs). Mark collisions if any two SIDs are equal.

| notificationType | ENV | Content SID runtime | Vars backend | Body esperado en Twilio (manual) | Verificado |
| ---------------- | --- | ------------------- | ------------ | -------------------------------- | ---------- |
| ARRIVAL_REMINDER_15_MIN | TWILIO_ARRIVAL_REMINDER_CONTENT_SID | _paste SID_ | 1=nombre, 2=serviceRef, 3=**hora** | Body must treat {{3}} as **time**, not date | ☐ |
| EXIT_REMINDER_15_MIN | TWILIO_EXIT_REMINDER_CONTENT_SID | _paste SID_ | 1=nombre, 2=serviceRef, 3=**hora** | {{3}} = end time | ☐ |
| NO_CHECKIN_AT_START | TWILIO_TEMPLATE_NO_CHECKIN_SID | _paste SID_ | 1=nombre, 2=serviceRef | 2-var body | ☐ |
| ATTENDANCE_CONFIRMATION_REMINDER | TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID | _paste SID_ | 1=nombre, 2=serviceRef, 3=**fecha**, 4=**hora** | {{3}}=date, {{4}}=time | ☐ |
| EVENTUAL_OPERATION_ASSIGNED | TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID | _paste SID_ | 1=firstName, 2=serviceRef, 3=**fecha**, 4=**hora** | {{3}}=date, {{4}}=time | ☐ |

**Critical equality checks (startup also logs `TWILIO_CONTENT_SID_COLLISION`):**

- [ ] `TWILIO_ARRIVAL_REMINDER_CONTENT_SID` ≠ `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID`
- [ ] `TWILIO_ARRIVAL_REMINDER_CONTENT_SID` ≠ `TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID`
- [ ] `TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID` ≠ `TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID`

If SIDs collide, two different producers can show **visually similar** Meta bodies — that is **not** proven duplicate job execution.

---

## Twilio Console steps

1. Open [Twilio Console → Content Template Builder](https://console.twilio.com/).
2. For each Content SID in the table above, open the template.
3. Confirm placeholder count matches the backend contract (3-var vs 4-var).
4. Confirm semantic mapping:
   - **ARRIVAL:** `{{3}}` = **hora** (start time).
   - **CONFIRMATION / ASSIGNMENT:** `{{3}}` = **fecha**, `{{4}}` = **hora**.
5. Note whether the published Meta body still says “enviá Llegué” while the product also accepts **direct location** — if so, treat as **copy inconsistency to fix in Twilio**, not by removing location-first in code.
6. Record “Verificado” date and reviewer initials in the table.

---

## Phone / employee scope

Resolve `phone → employee_id` outside this script, then set `@employeeId`.  
Do **not** filter by phone inside the UNION — that previously scoped only `whatsapp_messages` and could mix employees across sources.

---

## Producers (do not delete without forensics)

| Producer (logs) | notificationType | Channel |
| --------------- | ---------------- | ------- |
| `ATTENDANCE_REMINDER_JOB` | ARRIVAL / EXIT / NO_CHECKIN / ATTENDANCE_CONFIRMATION | Content template |
| `ASSIGNMENT_NOTIFICATION_WORKER` | EVENTUAL_OPERATION_ASSIGNED | Content template |
| `BOT_CONFIRMATION_RESPONSE` | TwiML “✅ Participación confirmada.” | Freeform |
| `BOT_CHECK_IN` / `BOT_CHECK_OUT` | Arrival/checkout registered copy | Freeform |

Structured log event: `WHATSAPP_NOTIFICATION_SENT` / `WHATSAPP_NOTIFICATION_FAILED`  
(`backend/src/utils/whatsapp-notification-observability.ts`).

---

## DB forensics

Read-only script:

`audit/sql/whatsapp-notification-incident-forensics.sql`

Use it to distinguish:

1. ARRIVAL + ARRIVAL same key → potential real duplication  
2. ARRIVAL + ATTENDANCE_CONFIRMATION → distinct events  
3. ARRIVAL + EVENTUAL_OPERATION_ASSIGNED → distinct events  
4. Same `providerMessageSid` → provider/retry investigation  
5. Distinct SIDs → two real sends  

Anything not proven by SID + DB rows remains **NO DEMOSTRADO**.
