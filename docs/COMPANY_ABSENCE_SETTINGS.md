# Company absence settings (PR 3)

## Overview

Absence default allowances are stored per company in `company_absence_settings`, not hardcoded in employee flows.

Each row defines:

- `absence_type_code` — must match a row in `absence_types` for the same company
- `default_annual_days` — non-negative decimal (supports values like `2.5`)
- `auto_assign_on_employee_create` — when `true`, new employees receive a balance for the current operational year

## Seeding

- New platform companies receive standard absence types and default settings inside the company creation transaction.
- Migration `028_company_absence_catalog_backfill.sql` backfills existing companies idempotently.
- Runtime `ensureAbsenceCatalogForCompany` is safe to call multiple times.

The default values seeded for new companies are initial editable configuration values. They are not hardcoded runtime business rules.

Examples of initial defaults:

- `VACATION = 14`
- `STUDY_DAY = 2.5`

Companies can update them through the absence settings API.

## Employee balances

- **New employees:** employee creation and absence balance initialization run in a single database transaction. If balance initialization fails, the employee row is rolled back and the API returns an error.
- Absence catalog/settings are ensured before the employee transaction starts. Balance inserts are transactional with employee creation; catalog reads during init use committed data outside the transaction.
- Balances are created only for settings with `auto_assign_on_employee_create = true`, using `default_annual_days`. Inactive absence types are skipped.
- **Existing employees:** balances are never overwritten automatically.

## API

- `GET /api/companies/:companyId/settings/absences`
- `PATCH /api/companies/:companyId/settings/absences`

Requires `company:read` (GET) and `company:settings:update` (PATCH).

Full absence settings UI is planned for a later PR; backend/API is available from PR 3.
