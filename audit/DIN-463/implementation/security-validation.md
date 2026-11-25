# Security validation

- Company mode R/W: `/api/platform/billing/companies/:companyId/commercial-seat-quota-settings` behind `requirePlatformAdmin`.
- Company admins cannot set their own commercial seat mode (no company-scoped PATCH route).
- Tenant isolation: all queries scoped by `company_id`.
- No cross-tenant contractual data in error messages.