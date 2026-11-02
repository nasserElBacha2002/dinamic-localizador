# Review corrections — attendance features (2026-11)

**Overall status:** `IMPLEMENTED_WITH_ISSUES`

## Review items mapping

| # | Feedback | Action | Files | Verified |
|---|----------|--------|-------|----------|
| P1 | Idempotent WhatsApp edit must heal post-commit side effects | On `alreadyApplied`, commit then `ensureWhatsappEditPostCommitSideEffects` (bump + `ensureOperationalForUpdatedRequest`) | `absence-request.service.ts`, `absence-request-whatsapp-edit-side-effects.ts`, `admin-alert-absence-updated.service.ts` | Unit: `absence-request.updateFromWhatsapp-idempotency.test.ts`, `absence-request-whatsapp-edit-side-effects.test.ts` |
| P2 | “Exportar PDF” mislabel | **Option B:** UI renamed to **Exportar HTML (imprimible)**; still `text/html` + `.html` | `WhatsappConversationDetailPage.tsx` | Frontend build |
| P3 | Silent export truncation | Paginated load + `exportMeta`; HTML banner “Export incompleto: X de Y” | `whatsapp-conversation-export-messages.ts`, export service/HTML | `whatsapp-conversation-export-messages.test.ts`, HTML test |
| P4 | Self-overlap should offer edit | `findEditableOverlappingRequest` + `WAITING_ABSENCE_OVERLAP_PROMPT` bot flow | `absence-bot.service.ts`, `absence-whatsapp-edit.service.ts`, migration 154, types | Build only; no dedicated overlap integration test |
| P5 | Balance override audit incomplete | Audit payload: `balanceBefore`, `balanceAfter`, `requestedDays`, `approvedByUserId`, `approvedAt`, `balanceApprovalOverride` | `absence-review.service.ts` | Code review; no new E2E approve test |
| P6 | Real approve flow with negative balance | **Deferred** — existing test only covers gate skip, not full `approve()` ledger | — | Not demonstrated |
| P7 | Full WhatsApp edit FSM test matrix | **Partial** — idempotency/heal + side-effect helper; not full FSM/integration matrix | New unit tests only | Partial |
| P8 | Export endpoint/service/auth tests | Service 404/meta + platform-admin gate test | `whatsapp-conversation-export.service.test.ts`, `whatsapp-observability-export-authz.test.ts` | Pass (16 tests in corrections bundle) |
| P9 | DAILY_EMAIL + ABSENCE_REQUEST_PENDING regression | Existing policy tests re-run | `admin-notification-channel-policy.test.ts` | Pass |
| P10 | Reconciliation “does not backfill…” fail | **Not reproduced** without SQL Server integration env in this run | — | Skipped |

---

## P1 — Idempotency heal

**Finding:** Retry with same `MessageSid` returned early after idempotency marker, skipping failed admin alert / operational bump.

**Root cause:** `alreadyApplied` branch committed and returned without post-commit obligations.

**Fix:** Shared `ensureWhatsappEditPostCommitSideEffects`; invoked on success path and on idempotent retry. Previous dates recovered from audit via `findWhatsappEditAuditContext` when possible.

---

## P2 — Export label

**Choice:** Option B (no new PDF dependency). Button and download remain HTML; label matches behavior.

---

## P3 — Truncation

**Fix:** Internal pagination (500/page), hard cap 50_000 with `truncated: true`; JSON/HTML include `exportMeta`; audit export logs truncation counts.

---

## P4 — Overlap UX

**Fix:** On `ABSENCE_OVERLAP` during create, if editable overlapping request exists for same employee, prompt with modify / view / cancel instead of generic error only.

---

## P5 — Override audit

**Fix:** Structured audit fields on approve with `allowInsufficientBalance` when type deducts balance.

---

## Tests added

- `absence-request-whatsapp-edit-side-effects.test.ts`
- `absence-request.updateFromWhatsapp-idempotency.test.ts`
- `whatsapp-conversation-export-messages.test.ts`
- `whatsapp-conversation-export.service.test.ts`
- `whatsapp-observability-export-authz.test.ts`
- Extended `whatsapp-conversation-export-html.test.ts`

See `corrections-tests.txt` (16 tests, pass).

---

## Validation

- `cd backend && npm run build` — pass
- `cd frontend && npm run build` — pass
- Corrections test bundle — pass (see above)

---

## Residual risks

- Full approve with balance 0 → 35 days → ledger −35 not exercised end-to-end in automated tests.
- WhatsApp edit FSM edge cases (concurrency, ownership, invalid inputs) lack integration coverage.
- Reconciliation integration failure (P10) not diagnosed in this environment.
- Export hard cap 50k still possible; user is warned when truncated.

---

## Unresolved debt

- Integration/DB tests for edit overlap scenario (28/12–31/01 vs 04/01–31/01).
- Broader export route tests (Content-Type, filename, tenant) beyond platform-admin gate.
- P10 reconciliation suite green under isolated DB.

---

## Explicitly not done

- Real PDF generation (Option A).
- Global alert channel semantics change.
- Weakening geolocation/attendance validations.
- Changing reconciliation test expectations without root-cause fix.

---

## Closure criteria vs status

| Criterion | Met? |
|-----------|------|
| Edit retry heals side effects | Yes (unit) |
| Export label honest | Yes |
| Truncation explicit | Yes (≤50k cap) |
| Self-overlap edit entry | Yes (code; limited test) |
| Override audit before/after | Yes (code) |
| Balance −35 E2E | No |
| Full FSM tests | No |
| Export auth | Partial |
| DAILY_EMAIL fix | Yes (policy tests) |
| Reconciliation green | Not verified |

**Status:** `IMPLEMENTED_WITH_ISSUES`
