# Company location / service types (PR 4)

## Overview

Location and service types are company-scoped in `company_location_types`. Each company manages its own catalog through the settings API.

Stores continue to persist the selected value in `stores.store_format` for backward compatibility. That column stores the company location type **code**, not a hardcoded global enum.

## API

- `GET /api/companies/:companyId/settings/location-types?activeOnly=true|false`
- `POST /api/companies/:companyId/settings/location-types`
- `PATCH /api/companies/:companyId/settings/location-types/:locationTypeId`
- `DELETE /api/companies/:companyId/settings/location-types/:locationTypeId` (soft disable)

## Store assignment rules

- New/updated stores must use an **active** company location type code.
- Existing stores with legacy or inactive codes remain readable.
- Inactive types cannot be assigned to new stores or updates.

## Import behavior

- Optional columns such as `Formato` / `Tipo` are validated when present.
- Unknown inactive types produce a row validation error.
- Import does not auto-create new types.

Full settings UI refinements may arrive in PR 5.
