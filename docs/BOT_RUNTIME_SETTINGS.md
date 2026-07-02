# Bot runtime settings (Phase 1.8)

## Purpose

After the WhatsApp bot resolves `companyId` through the **existing** mechanism (`BOT_DEFAULT_COMPANY_ID`, `BOT_DEFAULT_COMPANY_NAME`, or current single-company fallback), runtime validation uses that company's `company_settings` via `botRuntimeSettingsService.getBotRuntimeSettings(companyId)`.

Phase 1.7 (WhatsApp multi-company resolution) is **deferred**. This phase does not change how inbound messages pick a company.

## Resolution priority

For each runtime field:

1. `company_settings` (persisted row)
2. `DEFAULT_COMPANY_OPERATIONAL_SETTINGS` when row is missing
3. Env fallback for fields not stored in `company_settings`
4. Safe application defaults only on **transient** read errors (logged warning)

`getBotRuntimeSettings` performs a **single** read through `companyOperationalSettingsService.getCompanyOperationalSettingsWithSource`.

Business errors (`AppError` 4xx such as `COMPANY_NOT_FOUND`) are **rethrown** — invalid company access does not silently fall back to defaults.

### Settings source naming

`BotRuntimeSettingsSource` / operational `source` values:

- `company_settings` — persisted row found
- `operational_defaults` — no row; application defaults used

This applies only to company_settings-backed fields. `geofenceReviewMarginMeters` and `sessionTtlMinutes` always come from env.

Resolver: `backend/src/services/bot-runtime-settings.service.ts`

Request scope: `runWithBotRuntimeSettings()` in `backend/src/utils/bot-runtime-settings-scope.ts`, loaded at the start of `whatsappBotService.handleWebhook()`.

## Mapping table

| Runtime behavior | company_settings | env fallback | status |
|------------------|------------------|--------------|--------|
| Geofence radius (store fallback) | `defaultRadiusMeters` | `BOT_DEFAULT_RADIUS_METERS` | migrated |
| Geofence review margin | — | `BOT_GEOFENCE_REVIEW_MARGIN_METERS` | env for now |
| Late / on-time grace | `lateGraceMinutes` | `BOT_ON_TIME_GRACE_MINUTES` | migrated |
| Operation timezone | `operationTimezone` | `BOT_OPERATION_TIMEZONE` | migrated |
| Early checkout tolerance | `earlyLeaveToleranceMinutes` | `BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES` | migrated |
| Require checkout location | `requireCheckoutLocation` | `true` | migrated |
| Manual corrections policy | `allowManualAttendanceCorrections` | `true` | admin/manual flows only |
| Session TTL | — | `BOT_SESSION_TTL_MINUTES` | env for now |

Store-specific `allowed_radius_meters` still takes precedence when > 0. Company `defaultRadiusMeters` is used when the store radius is zero or missing.

## Check-in (`Llegué`)

Uses `buildCheckInValidation()`:

- Geofence: store radius or `defaultRadiusMeters` + `geofenceReviewMarginMeters`
- Punctuality: inventory tolerances + `lateGraceMinutes`
- User-facing times: `operationTimezone` (via `buildArrivalRegisteredMessage` / `formatLocalTime`)

## Check-out (`Terminé` / `Me voy`)

Uses `buildCheckoutValidation()` when location is required:

- Geofence: same radius rules as check-in
- Early leave: `earlyLeaveToleranceMinutes`
- Overtime: scheduled end vs checkout time in business logic (UTC instants)

When `requireCheckoutLocation` is `false`:

- Bot skips location session and registers checkout with time-only validation
- Checkout coordinates are stored as `NULL` in `attendance_records` (migration `007_attendance_checkout.sql`)
- Confirmation message shows **"Ubicación: no requerida"** (never "Distancia: 0 m")
- `processCheckoutWithoutLocation` completes selection sessions when `sessionId` is provided

## Bot simulator

Simulator calls the same `handleWebhook()` path, so it loads company runtime settings automatically. `getLocationPresets()` also reads `getBotRuntimeSettings(companyId)` for radius/margin hints.

## Observability

Info log per resolution (production-safe):

```json
{ "companyId": "...", "settingsSource": "company_settings" }
```

Warnings on transient fallback include `companyId` and `errorCode` only.

## Deferred

- Phase 1.7: WhatsApp multi-company resolution / shared-number routing
- Per-company Twilio numbers
- `geofenceReviewMarginMeters` and `sessionTtlMinutes` in `company_settings`
- Removing env vars (kept as fallback)

## Related docs

- [COMPANY_SETTINGS.md](./COMPANY_SETTINGS.md)
- [PERMISSIONS.md](./PERMISSIONS.md)
- [MULTI_COMPANY_HARDENING.md](./MULTI_COMPANY_HARDENING.md)
