# Feature 1 — Conversation export

**Status:** IMPLEMENTED_WITH_ISSUES (post-review corrections)

## Summary
- `GET /api/platform/observability/whatsapp/conversations/:id/export?format=json|html`
- UI: **Exportar HTML (imprimible)** + JSON (no PDF mislabel).
- Paginated message load; `exportMeta` with `truncated` + incomplete banner in HTML when over hard cap (50_000).
- Observability audit action `OBSERVABILITY_EXPORT` includes truncation metadata.

## Tests
- `whatsapp-conversation-export-html.test.ts` — escape + truncation banner
- `whatsapp-conversation-export-messages.test.ts` — pagination + truncated flag
- `whatsapp-conversation-export.service.test.ts` — 404 + exportMeta
- `whatsapp-observability-export-authz.test.ts` — platform-admin gate

## Validation
- `cd backend && npm run build` — pass
- `cd frontend && npm run build` — pass
