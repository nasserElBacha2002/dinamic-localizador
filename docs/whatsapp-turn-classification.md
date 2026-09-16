# WhatsApp turn classification (Phase 1 — shadow)

Shadow classification + durable SYSTEM interaction context. **No quotas, no blocking, no TwiML changes.**

## Flag matrix

| `WHATSAPP_TURN_CLASSIFICATION_ENABLED` | `SHADOW_ONLY` | `WHATSAPP_SYSTEM_CONTEXT_ENABLED` | Effect |
|---|---|---|---|
| `false` | * | * | **Full off** — no new classification/context reads or writes; existing sessions unchanged |
| `true` | `true` | `true` | Shadow classify + durable SYSTEM prep/correlate |
| `true` | `true` | `false` | Shadow classify only (no system interaction I/O) |
| `true` | `false` | * | **Invalid in Phase 1** — env validation fails at boot |

Defaults: all three `true` (shadow mode).

## Activation / shutdown / rollback

1. Apply migrations **123** then **124** on the target database (never rewrite applied history).
2. Deploy code with flags defaulting to shadow.
3. **Full off:** set `WHATSAPP_TURN_CLASSIFICATION_ENABLED=false` (no DROP required).
4. **Operational rollback** (preserve history): full off + keep tables.
5. **Destructive rollback:** separate SQL under `database/migrations/rollback/` — drops causation / restores CHECK; **data loss**; clear PREPARED/SEND_* first.

## Transactional boundary (SQL ↔ Twilio)

Not atomic. Order for interactive SYSTEM producers:

1. `prepare` → `PREPARED` (idempotent `source_key`)
2. Twilio send
3. `markSendAccepted` → `ACTIVE` | `markSendFailed` | `markSendAmbiguous`

If Twilio accepts and SQL accept fails: **do not re-send**; reconcile to ACTIVE. Invalid replies do not consume. Consume only on operational success result codes after a **new** classification insert.

## TTL

Derived from operational windows (`BOT_SESSION_TTL_MINUTES`, reminder lead / no-checkin window, confirmation `scheduledStart`) — not a universal 2h.

## Retention

`whatsapp_turn_classifications` and `whatsapp_system_interactions` are included in WhatsApp retention. Active/prepared/ambiguous interactions are not purged.

## Producers (SYSTEM_EXEMPT)

| Producer | ACTIVE interaction? | Notes |
|---|---|---|
| Attendance reminders | Yes (after accept) | Prep before send |
| Operation assignment notification | Yes (after accept) | Worker may be disabled |
| Payroll available notification | No | Informative only |
| Admin alert delivery | No | Subject employee when known |
| Payroll PDF documents | No | `causation_message_sid` → inbound query SID |

## Limitations (real)

- Early webhook exits (duplicate MessageSid, signature failure, company unresolved) may not classify.
- Unknown employee → AMBIGUOUS / identity unresolved.
- Observability off: routing result still recorded via `whatsapp-routing-result` ALS (not obs metrics).
- Concurrent SQL races: covered by unique keys + duplicate-key recovery; validate with `test:integration` when DB available.

## Phase 2

Not started. Do not set `SHADOW_ONLY=false` until quotas/blocking are implemented.
