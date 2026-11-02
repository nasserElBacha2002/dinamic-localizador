# Feature 2 — Edit pending absence via WhatsApp

**Status:** IMPLEMENTED_WITH_ISSUES (post-review corrections)

## Summary
- Menu **Modificar una solicitud** + overlap prompt **¿Querés modificarla?** when create overlaps own editable request.
- `updateFromWhatsapp` idempotent retry heals operational bump + admin alert via `ensureWhatsappEditPostCommitSideEffects`.
- States: `WAITING_ABSENCE_EDIT_*`, `WAITING_ABSENCE_OVERLAP_PROMPT` (migration `154_bot_session_absence_edit_states.sql`).

## Tests
- `absence-request.updateFromWhatsapp-idempotency.test.ts` — heal on duplicate MessageSid
- `absence-request-whatsapp-edit-side-effects.test.ts` — bump + ensure alert
- Full FSM/integration matrix from review spec — **not complete**

## Validation
- `cd backend && npm run build` — pass
