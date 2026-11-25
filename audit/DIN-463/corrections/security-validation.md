# Security validation — round 3

| Control | Status |
|---------|--------|
| Platform-only commercial seat settings route | unchanged (prior impl) |
| Company ENFORCE requires global ENFORCE | code |
| Generic company settings PATCH bypass | not exposed in schemas (prior audit) |
| `seed-employees` bypass | **removed** (`seed:employees` script deleted) |
| HTTP integration tests | **not run** (SQL blocked) |

Use import/API for bulk collaborators; multi-tenant isolation via `companyId` on all service paths.