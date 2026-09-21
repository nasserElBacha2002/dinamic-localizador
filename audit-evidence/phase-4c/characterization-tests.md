# Phase 4C — Characterization tests

## Pure helpers

`backend/src/services/bot/checkout-architecture.characterization.test.ts` — **8** tests

- `resolveCheckoutWhatsAppResultCode`
- `roundCheckoutDistanceMeters`
- `attendanceRecordFromVirtualCheckIn`
- `classifyReminderSendOutcome` / `mergeReminderKindCounts`

## Flow-level (orchestrator wiring)

`backend/src/services/bot/checkout-attendance.flow.characterization.test.ts` — **4** tests

| Case | Asserts |
|------|---------|
| A | durable `registerCheckoutWithLocation` + `CHECKOUT_COMPLETED` |
| B | `CHECKOUT_REJECTED` → `LOCATION_OUTSIDE_ALLOWED_RADIUS` |
| C | exit-without-arrival → `CHECKOUT_WITHOUT_ARRIVAL` |
| D | dry-run uses virtual hydration; no durable command; statuses/distance preserved |

Helpers `resolveCheckoutWhatsAppResultCode` / `attendanceRecordFromVirtualCheckIn` are **not** mocked.
