# Security / HTTP validation — DIN-463 final

## Executed (regression only)

Full integration suite includes HTTP auth tests (capabilities, 401/403, cross-company) — **884 pass**, exit 0.

## NOT_EXECUTED (commercial seat HTTP)

No dedicated integration test targets:

- `GET/PATCH /api/platform/billing/companies/:companyId/commercial-seat-quota-settings`
- Tenant isolation of contractual quota metadata
- Unauthorized ENFORCE activation at company level when global is DISABLED/OBSERVE
- Unauthenticated / wrong-role access to commercial configuration

**Status:** **NOT_EXECUTED** for DIN-463-specific HTTP matrix (§7).

## Billing HTTP (indirect)

Broader billing/platform integration tests passed in regression; they do not assert commercial seat settings endpoints.