# WhatsApp forwarded location validation

**Date:** 2026-08-25  
**Status:** Reimplemented (minimal / best-effort)

## Policy

The backend **rejects LOCATION messages that Twilio/WhatsApp explicitly marks** with:

- `Forwarded=true`, or
- `FrequentlyForwarded=true`

Authoritative fields are **only** the top-level webhook form fields:

```text
payload.Forwarded
payload.FrequentlyForwarded
```

`ChannelMetadata` (including nested `data.context.Forwarded`) is **not** used for enforcement.

## Best-effort (not absolute)

This is **not** a guarantee against every form of location reuse. Observed cases exist where WhatsApp/Twilio does **not** expose these flags for some reuse/forward patterns. When flags are absent or false, the normal attendance flow continues (geofence, etc.).

Prefer wording such as:

> Las ubicaciones **explícitamente marcadas como reenviadas por el proveedor** son rechazadas.

Avoid absolute claims such as “las ubicaciones reenviadas no pueden fichar”.

## Flow

```text
LOCATION
  → extract Forwarded / FrequentlyForwarded
  → if either true: reject + admin alert (best-effort) + employee reply → STOP
  → else: session/direct → check-in/check-out → geofence → attendance
```

Single gate: `whatsappRouterService.routeLocationMessage` (covers session and direct paths).

## Admin alert

- Type: `FORWARDED_LOCATION_REJECTED` (SECURITY category)
- Emit: `emitAdminAlertSafely(..., "whatsapp-forwarded-location")`
- Dedup: `forwarded-location:{employeeId}:{MessageSid}` (inbound MessageSid claim remains primary idempotency)
- Emit failure must **not** allow attendance; employee still receives the rejection message

## Observability

- `LOCATION_RECEIVED` (includes forward flags)
- `LOCATION_FORWARD_STATUS`
- `FORWARDED_LOCATION_REJECTED` (`resultCode`, flags, sessionState, messageSid; no coordinates / raw payload)
