# Company settings (Phase 1.4)

## Purpose

Each company has operational settings stored in `company_settings`. These values configure attendance validation, geofencing defaults, checkout behavior, and manual correction policy for the selected company.

Settings are **company-scoped**. Users only access settings for companies they belong to (or any active company for platform superadmin).

## Fields

| Field | Meaning |
|-------|---------|
| `operationTimezone` | Timezone used for operational date/time calculations |
| `defaultRadiusMeters` | Base geofence radius for attendance location validation |
| `lateGraceMinutes` | Minutes after scheduled start before marking late arrival |
| `earlyLeaveToleranceMinutes` | Minutes before scheduled end allowed for early checkout |
| `requireCheckoutLocation` | Whether checkout (`Terminé`) requires shared location |
| `allowManualAttendanceCorrections` | Whether authorized panel users may correct attendance manually |

## Defaults

| Field | Default |
|-------|---------|
| `operationTimezone` | `America/Argentina/Buenos_Aires` |
| `defaultRadiusMeters` | `150` |
| `lateGraceMinutes` | `15` |
| `earlyLeaveToleranceMinutes` | `15` |
| `requireCheckoutLocation` | `true` |
| `allowManualAttendanceCorrections` | `true` |

Application defaults are defined in `DEFAULT_COMPANY_OPERATIONAL_SETTINGS` (not env vars).

## API

```
GET   /api/companies/:companyId/settings
PATCH /api/companies/:companyId/settings
```

Permissions:

| Action | Permission |
|--------|------------|
| Read | `company:read` |
| Update | `company:settings:update` |

Role access:

| Role | Read | Update |
|------|------|--------|
| OWNER | Yes | Yes |
| ADMIN | Yes | Yes |
| HR / SUPERVISOR / OPERATOR | Yes | No |
| READ_ONLY | Yes | No |

Platform superadmin can read/update settings for any active company.

### Idempotent settings creation

`GET /settings` uses `findOrCreateByCompanyId`:

1. Read existing row by `company_id`.
2. If missing, insert application defaults.
3. If a concurrent request inserts first (`UNIQUE(company_id)`), catch duplicate-key and read again.

`PATCH /settings` when the row is missing creates **one** row with `{ ...defaults, ...input }` (no separate update).

DB enforces one row per company via `UQ_company_settings_company` (migration 015) and idempotent index guard (migration 020).

## Frontend

- Route: `/settings/company`
- Nav: **Configuración de empresa** (visible with `company:read`)
- Editable only with `company:settings:update`
- Uses `scopedApiClient` → `settings` → `companies/:activeCompanyId/settings`
- Client validation mirrors backend for timezone and numeric fields

## Runtime integration status

| Flow | Uses `company_settings` today? |
|------|--------------------------------|
| Web admin settings UI | Yes |
| `getCompanyOperationalSettings(companyId)` helper | Yes, with application defaults when row is missing |
| WhatsApp bot geofence radius | Deferred — current runtime still uses existing env/config path |
| WhatsApp on-time grace | Deferred — current runtime still uses `BOT_ON_TIME_GRACE_MINUTES` |
| WhatsApp operation timezone | Deferred — current runtime still uses `BOT_OPERATION_TIMEZONE` |
| Checkout tolerance | Deferred — not fully migrated to per-company settings |

## Deferred

- Full migration of WhatsApp/bot flows from env defaults to per-company `company_settings`
- Module enforcement based on `company_modules` — see [COMPANY_MODULES.md](./COMPANY_MODULES.md) (settings page includes module toggles)
- WhatsApp employee portal
- Employee self-service accounts

## Related docs

- [MULTI_COMPANY_HARDENING.md](./MULTI_COMPANY_HARDENING.md)
- [COMPANY_USER_MANAGEMENT.md](./COMPANY_USER_MANAGEMENT.md)
- [COMPANY_MODULES.md](./COMPANY_MODULES.md)
