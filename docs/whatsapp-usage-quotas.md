# WhatsApp usage quotas (Phase 2)

Non-critical employee turn/outbound quotas. **Defaults OFF.** No production ENFORCE from deploy.

## Authoritative routing resolution

**Source of truth:** `resolveWhatsAppTextTurn` / `resolveWhatsAppLocationTurn` in
`backend/src/services/whatsapp-turn-routing.resolver.ts` (pure, no side effects).

Planner adapters, classification, quota admission, and `whatsappRouterService.routeTextMessage`
consume the **same** resolution object (`turnResolution` on the router context).

### Precedence (text)

1. Global help / menu → `MENU` (limited)
2. Global cancel / back → critical session navigation stays critical; otherwise `MENU`
3. Explicit flow-switch intent incompatible with active session → free-intent destination;
   `cancelSessionBeforeDispatch=true` (router cancels **only after** limited admission /
   immediately for critical)
4. Menu snapshot selection → option handler + continue session
5. Active session continuation → null handler, `continueActiveSession`
6. Free-text intents / empty / menu fallback

Invariants:

- Critical explicit intents beat limited session continuity (e.g. payroll session + “Llegué”).
- Limited explicit intents beat critical continuity when switch is allowed (e.g. location wait + “recibo”).
- Invalid input inside a critical session remains critical continuation.
- Rejected limited turns never cancel/modify the session.

## Phase 1 prerequisites (verified in code + contract tests)

| Defect | Status | Evidence |
|---|---|---|
| Shadow lookup before router blocking attendance | Fixed | correlate fail-open + budget |
| SYSTEM context only after Twilio | Fixed | prepare → send → mark |
| TOP-1 correlation | Fixed | candidates + category/op match |
| Limited flow inherits critical session | Fixed | **resolver** emits limited handler on switch; classifier + admit use it (`whatsapp-turn-routing.resolver.test.ts`, `whatsapp-quota-pipeline.contract.test.ts`) |
| Reactivate CONSUMED / renew expiry | Fixed | prepare terminals |
| Consume on reasonCode | Fixed | operational resultCode after insert |
| SQL insert races | Fixed | duplicate key handling |
| Full off flags | Fixed | classification kill switch; quota OFF zero I/O (repo spy in pipeline contract) |
| Observability dependency | Fixed | routing-result ALS |
| Unknown session → LIMITED via intent unknown | Fixed | classifier v3 |

## Architecture

```
webhook claim → resolveWhatsAppTextTurn (pure) → classify →
  CRITICAL: route with turnResolution (no admit) →
  AMBIGUOUS: silent ACK (no session cancel) →
  LIMITED: admitTurn → on success route with turnResolution
           (cancelSessionBeforeDispatch only inside router after admit) →
    respond/document: reserve outbound (ENFORCE) or shadow-evaluate (SHADOW)
```

## Modes

| Global | Company | Effective |
|---|---|---|
| OFF | * | OFF — **no** reads/writes on `whatsapp_quota_*` |
| * | OFF | OFF |
| ENFORCE | ENFORCE | ENFORCE |
| otherwise | | SHADOW |

`WHATSAPP_QUOTA_GLOBAL_MODE` default `OFF`. Company `whatsapp_quota_mode` default `OFF`.

### SHADOW

- Inbound: records `SHADOW_WOULD_ADMIT` / `SHADOW_WOULD_REJECT` (does not mutate period counters).
- Outbound: same policy evaluation as ENFORCE; inserts `SHADOW_WOULD_*` reservation rows; **never blocks**.
- Burst ENFORCE counts only `decision=ADMITTED` AND `mode=ENFORCE`.

### ENFORCE transition

Safe path: SHADOW pilot → verify shadow decisions → enable company ENFORCE while global ENFORCE → monitor. Prior SHADOW rows must not inflate burst.

## Units

- **Turn:** inbound MessageSid classified `EMPLOYEE_LIMITED`, admitted once (ENFORCE).
- **Outbound:** each non-empty TwiML (`RESPONSE_BUILT`) and each REST document (`ACCEPTED` with provider sid when known).

## Timezone

Open periods are reused when `period_start_utc <= now < period_end_utc`, regardless of the
current company timezone setting. Changing TZ mid-period does not reset counters; a new
period opens only after the UTC interval ends (`preferOpenOrResolvePeriod`).

## Retention

Tables `whatsapp_quota_*` are on the WhatsApp retention whitelist (children before parents).
Never purge `RESERVED` / `ATTEMPT_STARTED` / `AMBIGUOUS` outbounds or in-flight notices.

## Outbound states

`RESERVED` → `ATTEMPT_STARTED` → `RESPONSE_BUILT` (TwiML) or `ACCEPTED` (provider) |
`RELEASED` | `AMBIGUOUS` | `SHADOW_WOULD_*`.

## Admin UI (Phase 3)

Company settings → **Cuotas de WhatsApp**:

- `GET/PATCH /companies/:companyId/settings/whatsapp-quotas`
- Permission: `company:read` (GET), `company:settings:update` (PATCH)
- Effective mode always from `explainEffectiveQuotaMode` (same as runtime quotas)
- Global mode is read-only; concurrency via `expectedUpdatedAt` → HTTP 409
- ENFORCE confirmation modal in UI; backend still validates the request
- Does **not** activate ENFORCE on deploy

## Local test without real WhatsApp

1. Apply migrations 123–126 on a test DB.
2. Keep `WHATSAPP_QUOTA_GLOBAL_MODE=OFF` unless intentionally testing SHADOW/ENFORCE.
3. Use bot simulator / webhook fixtures with Twilio signature disabled in local.
4. Never point ENFORCE at production.

## Rollback

Operational: set modes OFF (preserves counters). Schema: use rollback scripts for 126 then 125 only on disposable DBs.
