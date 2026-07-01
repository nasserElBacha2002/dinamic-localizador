# PR to main validation summary

## Scope

- Phase 2 operational terminology completion
- Phase 2.7 DB physical rename corrections
- Phase 2.8 frontend API aliases
- Company modules frontend cache optimization

## Modules cache fix

Company modules (`GET /modules`) are relatively stable per tenant. The frontend now caches them with React Query using a company-scoped key `["company-modules", companyId]`.

- **staleTime:** 10 minutes — navigating between pages under the same company does not refetch while data is fresh.
- **gcTime:** 30 minutes — cached modules survive layout/guard remounts during navigation.
- **refetchOnWindowFocus:** disabled for modules.
- **Company switch / logout:** `CompanyProviderGate` remounts company state on auth token change; `queryClient.clear()` on company switch.
- **Module updates:** `useUpdateCompanyModules` invalidates the company-scoped modules query after a successful PATCH.

Implementation: `frontend/src/hooks/company-modules-query.ts`, `frontend/src/hooks/useCompanyModules.ts`, `frontend/src/context/CompanyContext.tsx`.

## CI fixes

- Root `.env.example` now documents `BOT_ON_TIME_GRACE_MINUTES` for Docker Compose prod validation.
- Backend tests preload `setupUnitTestEnv()` via `tsx --import` so CI passes without a `.env` file.
- Frontend lint: `CompanyProviderGate` remount pattern and keyed `CompanyUserDialogForm` avoid `setState` in `useEffect`.

## API endpoint preference (Phase 2.8)

Frontend preferred endpoints:

- `/locations`
- `/operations`
- `/lookups/locations`
- `/lookups/operations`

Still intentionally using:

- `/employees`
- `/lookups/employees`

Assignment routes remain on `/inventories/:inventoryId/employees` (no backend operations alias).

Backend legacy routes `/stores`, `/inventories`, `/lookups/stores`, `/lookups/inventories` remain mounted for compatibility.

Browser routes unchanged: `/stores`, `/inventories`, `/employees`.

## Validation commands

| Command | Result |
|---------|--------|
| `cd backend && npm test` | PASS |
| `cd backend && npm run build` | PASS |
| `cd frontend && npm test` | PASS (126 tests) |
| `cd frontend && npm run build` | PASS |
| `cd frontend && npm run lint` | PASS |
| `python3 scripts/audit/audit_tenant_isolation.py` | PASS |
| `python3 scripts/audit/audit_db_operational_rename.py` | PASS |

## Manual checks

- [ ] Initial page load calls `GET /modules` once per active company.
- [ ] Navigating between pages (e.g. `/` → `/stores` → `/inventories` → `/attendance`) does not repeatedly call `GET /modules` while cache is fresh.
- [ ] Switching company triggers a new `GET /modules` for the selected company.
- [ ] Updating modules in company settings refetches modules after save.
- [ ] Disabled module guards still block access correctly.
- [ ] Locations page API uses `/locations`.
- [ ] Operations page API uses `/operations`.
- [ ] Import preview/confirm uses `/operations/import/...`.
- [ ] Attendance/statistics lookups use `/lookups/locations` and `/lookups/operations`.
- [ ] Bot simulator still works.

## Known limitations

- Inventory employee assignment API calls remain on `/inventories/:id/employees` until backend adds an operations alias mount.
- Modules cache does not auto-refresh on window focus; use settings save or company switch to force refresh.
