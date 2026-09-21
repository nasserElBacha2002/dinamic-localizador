# Twilio / webhook hardening review (4E.4)

## Surface

| Item | Status |
|------|--------|
| Endpoint | `POST /api/webhooks/twilio/...` via `twilio.routes.ts` |
| Signature | `createValidateTwilioSignature` → `runTwilioSignatureValidation` + Twilio SDK `validateRequest` |
| URL construction | Configured `TWILIO_WEBHOOK_URL` (not Express host) — avoids proxy Host skew |
| Invalid signature | **403** `TWILIO_SIGNATURE_INVALID` |
| Missing signature | **403** `TWILIO_SIGNATURE_CONFIG_MISSING` |
| Body parser | `urlencoded` before signature; params normalized for validation |
| MessageSid idempotency | `claimInboundMessage` — same hash → `IDEMPOTENT_REPLAY` |
| Payload anomaly | Different hash → `PAYLOAD_ANOMALY` / `ANOMALY` status |
| Rate limiting | Invitation/auth rate limits elsewhere; webhook relies on signature + claim |
| Logging | Event codes on failure; body **keys** only (no raw Body / phones in signature middleware) |
| Request size | Express JSON limit sized for imports; Twilio form posts are small |

## Company resolution

`resolveFromReceivingNumber` matches configured Twilio number when exactly one active company exists.  
**RESIDUAL_RISK:** multi-company WhatsApp number mapping not implemented (`TODO(phase-1.7)` in `whatsapp-company-context.service.ts`). Ambiguous multi-company paths return explicit unavailable/ambiguous bot messages — not a silent cross-tenant accept.

## Tests

- `validate-twilio-signature.test.ts`
- `twilio-webhook-signature.test.ts`
- `twilio-webhook.integration.test.ts` (SDK signature fixtures)
- MessageSid / anomaly covered in webhook event claim + prior 4D payload hygiene

## Bypass

Production must keep `validateSignature: true`. Test/local overrides must be explicit config — do not accidentally disable in prod env.
