# Company user management (Phase 1.3)

## Users vs employees

| Concept | Purpose |
|---------|---------|
| **users** | Web admin panel login (credentials, memberships) |
| **employees** | Operational workers (WhatsApp attendance, inventories) |

These are separate entities. Phase 1.3 does not create employee self-service accounts or merge the two models.

## Company membership model

- A `user` can belong to multiple companies via `user_company_memberships`.
- Each membership has its own `role`, `status`, and `is_default`.
- Authorization for operational APIs uses **company role + permissions**, not global `users.role`.

## Who can manage company users

Permission: `users:manage`

| Company role | Can manage users |
|--------------|------------------|
| OWNER | Yes |
| ADMIN | No (by current role map) |
| HR / SUPERVISOR / OPERATOR / READ_ONLY | No |

Platform superadmin can manage users in any active company without a membership row.

## API endpoints

Company-scoped (preferred):

```
GET    /api/companies/:companyId/users
POST   /api/companies/:companyId/users
GET    /api/companies/:companyId/users/:userId
PATCH  /api/companies/:companyId/users/:userId
PATCH  /api/companies/:companyId/users/:userId/deactivate
```

All require `users:manage` except `GET /api/companies/:companyId/me` (permissions for UI).

## Business rules

- Membership operations always filter by `company_id`.
- Cannot set or expose `users.is_platform_admin` through company user endpoints.
- Cannot change global `users.role` through company user endpoints.
- Cannot deactivate or demote the **last active OWNER** (unless platform superadmin).
- Cannot modify platform superadmin users unless requester is platform superadmin.
- Duplicate active membership returns `409 MEMBERSHIP_ALREADY_EXISTS`.

## Temporary password behavior

- **New user**: `temporaryPassword` is required (min 8 chars). The backend hashes it and never returns it in API responses. The admin must share the password they entered through a secure channel. Email invitations are **deferred** (no mailer in this phase).
- **Existing user**: password is not changed; membership is created or reactivated.

## Frontend

- Route: `/settings/users`
- Nav label: **Usuarios de empresa** (visible only with `users:manage`)
- Uses `scopedApiClient` → `users` → `companies/:activeCompanyId/users`
- Permissions from `GET /api/companies/:companyId/me`

## Related docs

- [MULTI_COMPANY_PHASE1.md](./MULTI_COMPANY_PHASE1.md)
- [MULTI_COMPANY_HARDENING.md](./MULTI_COMPANY_HARDENING.md)
