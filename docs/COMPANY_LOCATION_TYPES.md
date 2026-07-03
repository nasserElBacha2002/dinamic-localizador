# Company location / service types (PR 4)

## Overview

Location and service types are company-scoped in `company_location_types`. Each company manages its own catalog through the settings API.

Stores continue to persist the selected value in `stores.store_format` for backward compatibility. That column stores the company location type **code**, not a hardcoded global enum.

Migration `029_company_location_types_store_format_constraint.sql` removes the legacy global `CK_stores_store_format` CHECK. Validation is enforced at application level against `company_location_types`.

## Legacy compatibility seeds

The initial location/service type values seeded for new companies (`LEGACY_COMPANY_LOCATION_TYPE_SEEDS`) preserve existing `store_format` data from the previous global model. They are editable per company and can be disabled or replaced. They are not universal runtime business rules.

Examples of legacy seed codes: Express, Express Interior MZA, Market Bs As.

## API

- `GET /api/companies/:companyId/settings/location-types?activeOnly=true|false`
- `POST /api/companies/:companyId/settings/location-types`
- `PATCH /api/companies/:companyId/settings/location-types/:locationTypeId`
- `DELETE /api/companies/:companyId/settings/location-types/:locationTypeId` (soft disable)

Duplicate codes within the same company are rejected with `LOCATION_TYPE_CODE_ALREADY_EXISTS`. The same code may exist in different companies.

## Store assignment rules

- New/updated stores must use an **active** company location type code.
- Existing stores keep their current `store_format` value and remain readable.
- Inactive types cannot be assigned to new stores or updates.

## Import behavior

- Optional columns such as `Formato` / `Tipo` are validated when present and non-empty.
- Unknown values produce `IMPORT_UNKNOWN_LOCATION_TYPE_MESSAGE`.
- Empty values in optional columns do not fail import.
- Import does not auto-create new types.

Full settings UI refinements may arrive in PR 5.
