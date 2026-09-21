# Tenant isolation review

## Where isolation actually happens

| Layer | Mechanism | Strength |
|-------|-----------|----------|
| Middleware | `authenticate` + `resolveCompanyContext` | Sets `req.companyId`; membership or platform synthetic OWNER |
| Routes | `requirePermission` / module gates | Function-level (BFLA), not tenant by itself |
| Services | Pass `companyId` into repositories | Critical hand-off |
| Repositories | `AND company_id = @companyId` on ops tables | Primary enforcement |
| DB | Composite FKs (`087_phase1_tenant_composite_fks.sql`) | Integrity assist |
| Jobs | Per-row company_id + leases | Must not trust HTTP context |

## Verified company-scoped ID lookups (sample)

- `attendance.repository.findById` — `ar.id AND ar.company_id`
- `employee.repository.findById` — `e.id AND e.company_id`
- `operation.repository.findById` — `id AND company_id`
- `absence-request.repository.findById` — `id AND company_id`
- `payroll-receipt.repository.findById` — `receiptId AND company_id`
- Absence attachments / drafts / balance ledger — company scoped

## Defense-in-depth gaps (not confirmed cross-tenant IDOR)

| Pattern | Repo | Service check | Status |
|---------|------|---------------|--------|
| `userInvitationRepository.findById(id)` | Unscoped SQL | `invitation.companyId !== companyId` | PARTIAL |
| Platform observability / system logs | Global by id | `requirePlatformAdmin` | BY_DESIGN |

## Legacy vs preferred mounts

Same operational routers → same permission + same `req.companyId` once context resolved. Legacy resolves company via single membership (409 if ambiguous). **No authz asymmetry** on shared ops routers. Users/invitations only on company-scoped mount.

## Jobs / exports / reports

Statistics and exports take `companyId` from request context. Reminder/notification jobs operate on claimed rows with company_id. Residual: incomplete table list in `audit_tenant_isolation.py` (LOC-P1-008).

## Verdict

No confirmed cross-tenant IDOR on sampled high-value resources for company users. Remaining PARTIAL rows are untraced modules sharing the same middleware pattern (justified, not UNKNOWN).
