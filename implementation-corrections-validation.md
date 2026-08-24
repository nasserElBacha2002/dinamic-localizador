# Implementation corrections validation — WhatsApp attendance security

**Date:** 2026-08-24  
**Status labels:**

| Area | Label |
| ---- | ----- |
| ROOT-1 anti-forward | **IMPLEMENTED_AND_CONTRACT_VALIDATED** |
| Twilio field contract | **CONTRATO TWILIO CONFIRMADO** (`Forwarded`, `FrequentlyForwarded`) |
| Unit/lint/build | **IMPLEMENTACIÓN VALIDADA** |
| Production incident replay | **PRODUCCIÓN NO REPRODUCIDA** |
| Caso B (duplicate / wrong template body) | **CASO B NO DEMOSTRADO** |

---

## 1. Anti-forward contract

```text
LOCATION
  → Forwarded == true OR FrequentlyForwarded == true
  → FORWARDED_LOCATION_REJECTED (before geofence / attendance)
```

Single policy in `whatsappRouterService.routeLocationMessage`.

## 2. Twilio fields used

Only:

- `payload.Forwarded`
- `payload.FrequentlyForwarded`

Schema: optional strings in `twilio-webhook.schema.ts`.  
Removed speculative `ChannelMetadata` / Meta aliases from anti-forward detection.  
Absent fields → `false` (normal Twilio message). Invalid values → `false` (never invent `true`).

## 3. Tests executed

```bash
cd backend
npm run lint          # pass
npm run build         # pass
npx tsx --test \
  src/utils/location-message-metadata.test.ts \
  src/utils/whatsapp-notification-observability.test.ts \
  src/utils/attendance-reminder-template.test.ts \
  src/utils/operation-assignment-notification/assigned-template-variables.test.ts \
  src/services/whatsapp-router/whatsapp-router.service.test.ts
  # → 101 pass / 0 fail
npm test              # → 1455 pass / 0 fail
```

Covered regressions: Forwarded=true (direct / WAITING_LOCATION / checkout), FrequentlyForwarded=true, Forwarded=false, fields absent, new MessageSid + forward, Maps URL text, template 3/4-var contracts.

## 4. Observability corrections

- No exact lat/lng in permanent location logs (`hasCoordinates` only).
- Outbound logs: `templateVariableKeys` + `templateVariableCount` only (no personal values).
- Renamed `logWhatsAppNotificationSent` → `logWhatsAppNotificationEvent`.
- Attendance log: `LOCATION_ATTENDANCE_RECORDED` + durable `validationStatus` / `locationStatus` / `checkoutStatus` (no contradictory `ACCEPTED` + `OUTSIDE_GEOFENCE`).
- Content SID collision warn retained at startup.

## 5. SQL forensics corrections

`audit/sql/whatsapp-notification-incident-forensics.sql`:

- `@employeeId` **required**; phone-only filter removed.
- `same_provider_sid_row_count`: NULL SID → `0` (not grouped as duplicates).
- `same_attendance_reminder_key_count`: only attendance-notification rows; other sources → `NULL`.
- Documented manual fixture expectations (A/B employees, ARRIVAL/CONFIRMATION/ASSIGNMENT, NULL SID, shared SID).

## 6. Caso B — current state

Jobs/templates/windows **unchanged**. Hypothesis remains: distinct events + possible Content SID/body mismatch until forensics run.

## 7. Residual risks

- Anti-forward depends on Twilio sending the documented flags; E2E production forward not reproduced here.
- Caso B still needs DB + Twilio Console checklist.
- Historical pins without forward flags (if Twilio omitted them) would still pass — that would be a provider omission, not UNKNOWN inventado en código.

## 8. Files excluded from commit (hygiene)

Do **not** commit unless policy says otherwise:

- `implementation-whatsapp-attendance-security-diff.txt`
- `implementation-whatsapp-attendance-security-diffstat.txt`
- `implementation-whatsapp-attendance-security-status.txt`
- `implementation-corrections-diff.txt` / `diffstat` / `status` (local review copies)
- `review/` (gitignored)

Deliberate docs/tooling OK to keep:

- `audit/whatsapp-attendance-incident-audit.md`
- `audit/whatsapp-content-template-forensics.md`
- `audit/sql/whatsapp-notification-incident-forensics.sql`
- `implementation-corrections-validation.md` (this file; optional in commit)
