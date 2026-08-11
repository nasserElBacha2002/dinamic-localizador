# Location-first WhatsApp attendance — validation

## Architecture found

| Layer | Path |
|-------|------|
| Webhook | `twilio.routes` → `twilioWebhookController` → `whatsappBotService.handleWebhook` |
| Idempotency | `whatsappWebhookEventRepository.claimInboundMessage` **before** business logic; `markProcessed` after |
| Text intents | `parseBotIntent` → `handleArrivalIntent` / `handleCheckoutIntent` → `startCheckIn` / `startCheckout` |
| Location (legacy) | Active session `WAITING_LOCATION` / `WAITING_CHECKOUT_LOCATION` → `processLocationCheckIn` / `processLocationCheckout` |
| Workdays | `employeeWorkdayAvailabilityService.listAvailableForCheckIn` / `listOpenForCheckout` |
| Persistence | `employeeWorkdayAttendanceCommand.createAttendanceForEmployeeWorkday` / `attendanceRepository.registerCheckoutInTransaction` |

## Previous flow

1. User sends "Llegué" / "Me voy"
2. Bot creates waiting-location session (or selection)
3. User shares LOCATION
4. Bot validates geofence and writes attendance

## New flow

```
LOCATION (no active attendance session)
  → resolveAttendanceLocationIntent(checkInCandidates, checkoutCandidates)
  → CHECK_IN | CHECK_OUT | AMBIGUOUS_* | NONE | AMBIGUOUS_MIXED
  → reuse processLocationCheckIn / processLocationCheckout (same validations)
```

"Llegué" / "Me voy" remain supported (backward compatible): still open a session and ask for location.

## CHECK_IN vs CHECK_OUT resolution

| Candidates | Intent |
|------------|--------|
| 1 check-in, 0 checkout | `CHECK_IN` |
| 0 check-in, 1 checkout | `CHECK_OUT` |
| N check-in, 0 checkout | `AMBIGUOUS_CHECK_IN` (selection + pending location) |
| 0 check-in, N checkout | `AMBIGUOUS_CHECK_OUT` (selection + pending location) |
| both non-empty | `AMBIGUOUS_MIXED` — ask Llegué/Me voy (no silent pick) |
| both empty | `NONE` |

Never uses `first()` / arbitrary row.

## Idempotency

Unchanged and critical: MessageSid is **claimed before** intent resolution. A Twilio retry of the same LOCATION cannot re-run business logic (cannot turn a completed check-in into check-out).

## Concurrency

Same as before: attendance create/checkout use existing transactions, unique constraints, and session completion. Two different MessageSids racing still go through those paths; no new global locks.

## Multiple jornadas

Selection prompts reuse existing builders. `pendingLocation` stored in `BotSessionContext` so after the user picks a number, the original coordinates are applied without asking again (same session TTL).

## Reminder / copy updates

In-repo bot messages, menu hints, expiration text, and check-in confirmation copy now say **compartí tu ubicación** (commands optional).

**Ops follow-up:** Twilio Content templates (`TWILIO_ARRIVAL_*`, `TWILIO_EXIT_*`, `TWILIO_TEMPLATE_NO_CHECKIN_*`, etc.) live outside the repo — update approved template bodies in Twilio to remove mandatory "Llegué"/"Me voy" wording.

## Tests executed

| Command | Result |
|---------|--------|
| `npm run build` | pass |
| eslint touched bot files | pass (after removing unused import) |
| attendance-location-intent + bot response/menu/expiration + router + webhook integration | **158 pass / 0 fail** |

## Risks / follow-ups

- Twilio template bodies still may instruct "Llegué"/"Me voy" until Content SID copy is updated.
- `AMBIGUOUS_MIXED` requires a text command then a second location (acceptable rare case).
- Concurrent dual LOCATION with different MessageSids still relies on DB uniqueness (same as pre-change).
