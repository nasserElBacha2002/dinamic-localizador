# Phase 4C — Characterization tests

## Added

`backend/src/services/bot/checkout-architecture.characterization.test.ts`

Covers:

- `resolveCheckoutWhatsAppResultCode` (rejected / completed / without-arrival)
- `roundCheckoutDistanceMeters`
- `attendanceRecordFromVirtualCheckIn` (coords + simulation flags)
- `classifyReminderSendOutcome` + `mergeReminderKindCounts`

## Existing protection retained

- `checkout-validation.test.ts`
- Checkout / reminder / geofence / invitation / auth suites from 4A/4B (full unit run)

## Rule

Refactor must not change mapped result codes or simulation field defaults — tests lock current behavior.
