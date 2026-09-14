# WhatsApp usage quotas (Phase 2)

Non-critical employee turn/outbound quotas. **Defaults OFF.** No production ENFORCE from deploy.

## Phase 1 prerequisites (verified in code)

| Defect | Status | Evidence |
|---|---|---|
| Shadow lookup before router blocking attendance | Fixed | `whatsapp-bot.service` routes after plan/classify; correlate is fail-open + budget |
| SYSTEM context only after Twilio | Fixed | `prepare*` before send; `markSendAccepted` after |
| TOP-1 correlation | Fixed | `correlateForTurnSafe` + operation/category match |
| Limited flow inherits critical session | Fixed | Classifier v3: LIMITED handler before critical session |
| Reactivate CONSUMED / renew expiry | Fixed | `prepare` returns terminals; no expires renew |
| Consume on reasonCode | Fixed | Consume on operational `resultCode` after new insert |
| SQL insert races | Fixed | `isDuplicateKeyError` + re-select |
| Full off flags | Fixed | `WHATSAPP_TURN_CLASSIFICATION_ENABLED=false` |
| Observability dependency | Fixed | `whatsapp-routing-result` ALS |
| Unknown session → LIMITED via intent unknown | Fixed | Classifier v3 reorders unknown session before limited intents |

## Architecture

```
webhook claim → plan destination (no effects) → classify →
  CRITICAL: route (no quota) →
  AMBIGUOUS: silent ACK (held) →
  LIMITED: admitTurn atomic → route under quota ALS →
    respond/document: reserve outbound before effect
```

## Modes

| Global | Company | Effective |
|---|---|---|
| OFF | * | OFF |
| * | OFF | OFF |
| ENFORCE | ENFORCE | ENFORCE |
| otherwise | | SHADOW |

`WHATSAPP_QUOTA_GLOBAL_MODE` default `OFF`. Company `whatsapp_quota_mode` default `OFF`.

## Units

- **Turn:** inbound MessageSid classified EMPLOYEE_LIMITED, admitted once.
- **Outbound:** each non-empty TwiML message and each REST document under an admitted limited turn.

## Local test without real WhatsApp

1. Apply migrations 123–125 on a test DB.
2. Set `WHATSAPP_QUOTA_GLOBAL_MODE=SHADOW` (or ENFORCE only on a test company).
3. Use bot simulator / webhook fixtures with Twilio signature disabled in local.
4. Never point ENFORCE at production.

## Known limitations

- SHADOW would-block is advisory (read counters; races possible).
- Menu option planning assumes snapshot still valid; race with module changes follows existing menu handler.
- Admin UI / savings dashboards = Phase 3.
- Full mandatory matrix (all concurrency / DST / mid-period config) partially covered; expand before production ENFORCE.
