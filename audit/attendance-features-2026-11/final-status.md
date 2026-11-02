# Final status — attendance features (2026-11)

**After adversarial review corrections:** `IMPLEMENTED_WITH_ISSUES`

| Feature | Status | Notes |
|---------|--------|-------|
| 1 — WhatsApp conversation export | IMPLEMENTED_WITH_ISSUES | Honest HTML label; pagination + truncation meta; unit/service/auth tests added |
| 2 — Edit pending absence via WhatsApp | IMPLEMENTED_WITH_ISSUES | Idempotency heal + overlap prompt; FSM integration coverage incomplete |
| 3 — Approve with insufficient balance | IMPLEMENTED_WITH_ISSUES | Richer audit payload; E2E negative balance approve not demonstrated |

Cross-cutting: `DAILY_EMAIL` + `ABSENCE_REQUEST_PENDING` → WhatsApp urgent (policy tests pass). Platform-admin export gate tested.

Detail: `corrections/corrections-report.md`. Migration: `154_bot_session_absence_edit_states.sql` (includes overlap prompt state).
