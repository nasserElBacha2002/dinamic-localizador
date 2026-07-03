# Company settings (frontend)

## Overview

The Company Settings page (`/settings/company`) exposes:

- **Configuración operativa** — inline editable defaults for operations, imports, and WhatsApp validation.
- **Ausencias** — summary card with dialog for absence default catalog.
- **Tipos de ubicación / servicio** — summary card with dialog for location/service types.

Checkout, manual attendance corrections, and module toggles are **not** shown on this page.

## Module management

Module management is **platform-admin-only**. Company owners/admins can configure operational defaults, absences, and location/service types, but cannot enable or disable product modules.

- `GET /api/companies/:companyId/modules` — available to company members with `company:read` (used for navigation/module gating).
- `PATCH /api/companies/:companyId/modules` — requires platform admin (`PLATFORM_ADMIN_REQUIRED`).

Platform admins manage modules when creating companies (`POST /api/platform/companies`) or through future platform admin tooling. Module toggles do not belong on the company owner settings page.
