# Platform company management

## Scope

Only users with `users.is_platform_admin = 1` can create companies via:

```
GET  /api/platform/companies
POST /api/platform/companies
```

This is a **platform-level** feature. Regular company OWNER/ADMIN users cannot create new companies.

## What gets created

In a single transaction:

1. `companies` row
2. `company_settings` with defaults or provided values
3. `company_modules` for selected modules (default: all standard modules)
4. Initial **OWNER** membership for the owner user

Does **not** create:

- employees
- stores / inventories
- platform superadmin users

## Owner user handling

| Case | Behavior |
|------|----------|
| Owner email exists | Membership created; password unchanged |
| Owner email new | `temporaryPassword` required; password hashed |

Password is **never** returned in API responses. The admin must share the password they entered through a secure channel.

## Frontend note

The create-company dialog always requires an owner password as a UI simplification for this phase. The backend only uses it when the owner user does not exist yet.

## Users vs employees

- **users** → web admin panel login
- **employees** → WhatsApp operational workers

Company creation only provisions admin users.

## WhatsApp default company

Inbound WhatsApp tenant resolution (`BOT_DEFAULT_COMPANY_ID`) remains separate from company creation. New companies do not automatically become the WhatsApp default.

## Deferred

- Email invitation flow
- Employee self-service accounts
- Moving platform routes outside `CompanyGate` (superadmin currently selects an existing company before accessing `/platform/companies`)

## Related docs

- [COMPANY_USER_MANAGEMENT.md](./COMPANY_USER_MANAGEMENT.md)
- [MULTI_COMPANY_HARDENING.md](./MULTI_COMPANY_HARDENING.md)
