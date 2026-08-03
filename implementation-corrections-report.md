# WhatsApp Observability — Implementation Corrections

**Status:** `COMPLETED_WITH_WARNINGS`

## Changes made (review P0/P1)

### P0 fixed
1. **Message DTO masking** — `mapMessageToObservabilityDto` used by list + detail; phones masked, coords/raw omitted.
2. **Twilio signature split** — distinct validators for inbound (`TWILIO_WEBHOOK_URL`) and status (`TWILIO_STATUS_CALLBACK_URL`); status URL required in production when callbacks enabled; no silent URL inference.
3. **Status callback HTTP semantics** — 204 only after successful idempotent persist (including duplicates); 503 on persistence failure.

### P1 fixed / improved
4. **Orphan provider event reconciliation** — `linkPendingProviderEvents` / `linkOrphanedToMessage`; SQL integration covered.
5. **Notification provider projection** — `provider_*` columns (migration 077); distinct from API `SENT`.
6. **Typed result codes** — handlers/router/`respond()` propagate real `resultCode`/`flowType` (menu, workday, checkout, check-in, absence, confirmation, module gating, geofence outside, etc.).
7. **Blocked multi-company tracing** — `recordBlockedCompanyResolution` from webhook controller.
8. **Conversation concurrency** — `UPDLOCK, HOLDLOCK` resolve-or-create; SQL concurrency test (12 parallel creators → 1 conversation).
9. **Dedicated phone hash/encrypt secret** — `WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET`; encrypted `phone_normalized` (`v1:...`).
10. **Zod API validation** — params/query schemas; invalid inputs → 400.
11. **Audit coverage** — conversation/message/flow/notification/provider-events/reveal; null-company logged.
12. **Retention naming** — `WHATSAPP_OBSERVABILITY_TEMPLATE_VARS_RETENTION_DAYS` documents template-vars-only cleanup; docs updated.
13. **Frontend** — error detail via `?code=` + `useWhatsappErrorDetail`; Twilio tab via conversation provider-events aggregate; lazy routes.

### Migration
- `077_whatsapp_observability_corrections.sql` (+ rollback)
- Verified: apply → rollback → reapply (cols=4, fks=4)

## Root causes addressed
- Divergent sanitization paths (list vs detail)
- Shared signature middleware with wrong URL
- Fail-open misapplied to status ingest
- Missing orphan link + notification projection
- Generic `FLOW_COMPLETED` without handler contract
- Find-then-insert conversation race
- JWT-coupled phone hashing / plaintext storage

## Residual risks / deferred (P2)
- Fat observability query repository not split
- Cleanup job still process-local (document single-instance)
- Not every obscure bot edge has a unique result code
- Full HTTP signed Twilio E2E against live Twilio not run here
- Migration 076 apply/rollback/reapply not re-proven in this pass (077 was)

## Validation evidence (commands)
See `implementation-corrections-validation.txt`.
