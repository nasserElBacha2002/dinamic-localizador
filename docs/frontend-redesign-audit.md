# Frontend Redesign — Technical Audit

**Status:** `IN_PROGRESS` — Mantine foundation + shell + filters + simple forms implemented; **product still visually hybrid** on detail/complex flows (~54/100). **Last updated after PR 11** (2026-06-23). See [frontend-mantine-migration-audit-0-100.md](./frontend-mantine-migration-audit-0-100.md).  
**Stage audited:** Frontend redesign integration (pre-implementation audit; updated post PR 9 audit)  
**Date:** 2026-06-23 (updated — Mantine migration audit)  
**Scope:** Read-only analysis of `frontend/` — architecture, multi-company, permissions, React Query, components, styling, page impact, migration plan.  
**Companion doc:** [frontend-mantine-adoption-plan.md](./frontend-mantine-adoption-plan.md) — **mandatory Mantine adoption strategy**.

### Product decision (2026-07-01)

**Mantine is required** as the main UI foundation for the redesign. MUI 7 remains during migration. See the adoption plan for provider setup, token mapping, PR breakdown, and coexistence rules.

---

## 1. Executive summary

The Dinamic Attendance frontend is a **mature, multi-company-aware React 19 app** built on **MUI 7**, **TanStack Query 5**, **react-router-dom 7**, and **react-hook-form + Zod**. Core business flows (operations, attendance, absences, bot simulator, imports, statistics, settings) are implemented and protected by **route-level guards** (`FeatureRouteGuard`) plus **company scoping** (`scopedApiClient`, `CompanyGate`).

The codebase already contains **many primitives that overlap** with the proposed design system (`PageHeader`, `ListFilters`, `DataTable`, `LoadingState`, `ErrorState`, `EmptyState`, `ConfirmDialog`, `CompanySelector`, `AdminLayout`). A redesign is **feasible without rewriting business logic**, but **not as a visual-only pass**.

### Main findings

- **Architecture is sound for incremental migration.** Domain hooks, API modules, Zod schemas, and route guards can remain unchanged while the shell and shared UI are refactored.
- **MUI 7 is the current page UI library; Mantine 9 is installed** as the redesign foundation. Adoption follows a **dual-library strangler pattern** documented in [frontend-mantine-adoption-plan.md](./frontend-mantine-adoption-plan.md). **PR 1–9 implemented** (foundation, shell, design-system, main list tables, partial actions, full 0–100 audit). MUI remains on forms, detail pages, statistics, import, bot, maps, and login.
- **Multi-company foundations exist** (active company in context + localStorage, scoped APIs, `queryClient.clear()` on switch). Gaps remain around **route validation after company switch** and **avoiding stale UI during reload**.
- **Module fetching was recently stabilized** (`company-modules-query.ts`: 10 min `staleTime`, company-scoped key). Repeated `useCompanyModules()` calls share cache; network refetch on every navigation is **no longer the primary risk**, but **duplicate hook subscriptions** in layout + guards + pages still add coordination complexity.
- **Layout uses route-level Mantine `AppLayout`.** Protected routes render inside `design-system/layout/AppLayout`; legacy `AdminLayout` is deprecated and unused.
- **Table/filter patterns are partially consolidated.** Design-system `DataTable` / `FilterBar` power main list pages (employees, stores, inventories, attendance, absences, users, platform). Legacy MUI tables remain on detail sections, statistics, import, and inventory operational UI. List filters still use legacy `DateRangeFilter` and lookup autocompletes.
- **No redesign specification file** was found in the repository (`docs/` has operational/permissions docs only). Visual targets, Mantine component mapping, and token definitions must be confirmed before Phase 1.

### Readiness verdict

| Dimension | Ready? | Notes |
|-----------|--------|-------|
| Auth / session | Yes | `AuthProvider`, `ProtectedRoute`, token in localStorage |
| Company context | Mostly | Active company + persistence; switch clears cache |
| Modules cache | Yes | Centralized query options per company |
| Route guards | Yes | `FeatureRouteGuard` on all feature routes |
| API scoping | Yes | `scopedApiClient` + `company-path.ts` |
| Shared UI primitives | Partial | Exist but underused / MUI-coupled |
| Design system (Mantine 9) | PR 1–9 done | Foundation + shell + lists; **product hybrid (~46/100)** — see [audit](./frontend-mantine-migration-audit-0-100.md) |
| Responsive shell | Partial | Mobile drawer exists; tables/filters vary by page |

**Recommended next work:** **PR 12 — Complex forms + maps** (store create/edit, location picker, company settings). Full scored audit: [frontend-mantine-migration-audit-0-100.md](./frontend-mantine-migration-audit-0-100.md).

---

## 2. Current architecture overview

### 2.1 Stack

| Layer | Technology |
|-------|------------|
| Build | Vite 7, TypeScript 5.9 |
| UI | MUI 7 + Emotion (`sx` prop) |
| Routing | react-router-dom 7 |
| Data | TanStack Query 5, axios |
| Forms | react-hook-form, Zod 4, `@hookform/resolvers` |
| Charts | ECharts (`echarts-for-react`) |
| Tests | Node `tsx --test` (unit tests in `api/`, `hooks/`, `utils/`) |

**Not present:** Mantine, Tailwind, CSS Modules (in active use), styled-components.

### 2.2 Folder structure (high level)

```
frontend/src/
├── api/           # axios client, scoped client, domain API modules
├── components/    # common/, company/, domain-specific forms/tables
├── context/       # AuthContext, CompanyContext
├── domain/        # terminology labels (operations/workers/locations)
├── hooks/         # React Query hooks per domain
├── layouts/       # AdminLayout.tsx (only layout file)
├── lib/           # query-client.ts
├── pages/         # route pages by domain
├── routes/        # AppRoutes.tsx
├── schemas/       # Zod form schemas
├── theme/         # MUI createTheme
├── types/         # shared TS types
└── utils/         # permissions, company-modules, dates, export, maps
```

### 2.3 Application bootstrap (`main.tsx`)

```
ThemeProvider (MUI)
  → QueryClientProvider
    → BrowserRouter
      → AuthProvider
        → CompanyProviderGate (remounts on token change)
          → App → AppRoutes
```

### 2.4 Routing strategy

Single file: `routes/AppRoutes.tsx`.

```
/login                          (public)
/* ProtectedLayout */
  ProtectedRoute → CompanyGate → Outlet
    /, /employees, /stores, /inventories, /attendance, ...
    each feature route wrapped in FeatureRouteGuard
```

**Lazy routes:** statistics, bot-simulator, inventory import/detail, absence detail, attendance detail.

**Company selection:** No dedicated URL. `CompanyGate` renders `CompanySelectionPage` when `requiresSelection` (multi-company user, no active company).

### 2.5 What is reusable vs replace/wrap

| Layer | Reuse | Notes |
|-------|-------|-------|
| `api/*`, `scoped-client.ts` | **Keep** | Do not change contracts in redesign |
| `hooks/*` (domain) | **Keep** | UI-agnostic |
| `schemas/*`, `types/*` | **Keep** | Business validation intact |
| `FeatureRouteGuard`, `CompanyGate` | **Keep / refactor** | Logic stays; UI states may wrap |
| `utils/company-modules.ts` | **Keep** | Single source for nav + module checks |
| `layouts/AdminLayout.tsx` | **Wrap / replace** | Becomes `AppLayout` shell |
| `components/common/*` | **Wrap progressively** | Same APIs, new styling |
| MUI theme | **Extend or parallel** | If Mantine: new provider layer |
| Per-page `AdminLayout` usage | **Replace** | Move to route layout |
| Hand-rolled list tables | **Refactor** | Consolidate on `DataTable` / `FilterBar` |
| `index.css`, `App.css` | **Delete later** | Currently unused (no imports) |

---

## 3. Main findings

### 3.1 Layout and navigation

| Finding | Severity | Detail |
|---------|----------|--------|
| Sidebar + topbar in `AdminLayout.tsx` | OK | MUI `Drawer` + `AppBar`; mobile temporary drawer |
| Nav items from `getAdminNavItems()` | OK | Centralized in `utils/company-modules.ts` |
| Nav filtered by modules + permissions | OK | Same rules as home quick links |
| `AdminLayout` per-page | RISK | 20+ pages each wrap layout manually; easy to forget on new pages |
| Module fetch on navigation | OK (fixed) | `useCompanyModules` cached 10 min per `companyId` |
| Duplicate `useCompanyModules` subscribers | MEDIUM | `AdminLayout`, `FeatureRouteGuard`, `HomePage`, `CompanySettingsPage` |
| `ModuleRouteGuard` unused | LOW | Dead code; superseded by `FeatureRouteGuard` |
| Manual forbidden routes | OK | `FeatureRouteGuard` shows in-page forbidden state (not silent 404) |

**Navigation data flow:**

```
useCompanyModules() + useCompanyPermissions()
  → getAdminNavItems({ modules, permissions, isPlatformAdmin })
  → NavList in AdminLayout
```

**Recommendation:** Extract `AppLayout` as the **route layout** under `ProtectedLayout`, inject nav via context or props from existing `getAdminNavItems`. Keep one subscription to modules/permissions at layout level; pass data to guards via context to reduce duplicate loading states (optional optimization).

### 3.2 Multi-company readiness

| Check | Status | Evidence |
|-------|--------|----------|
| Active company state | OK | `CompanyContext.activeCompany` |
| Persistence | OK | `localStorage` key `dinamic.activeCompanyId` |
| Runtime + stored sync | OK | `setRuntimeCompanyId` in `company-path.ts` |
| Tied to auth | OK | `CompanyProviderGate` remounts on token change |
| Queries scoped by company | OK | Query keys include `companyId`; `useOperationalQueryEnabled` |
| API scoped | OK | `scopedApiClient` prefixes `companies/{id}/` |
| Switch invalidates cache | OK | `queryClient.clear()` on `selectCompany` / `clearActiveCompany` |
| Switch redirects home | OK | `CompanySelector` → `navigate("/")` |
| Route availability after switch | GAP | No check that current path is valid for new company's modules/permissions |
| Stale data during switch | RISK | Brief window possible before cache clear + remount; no global "switching" overlay |
| Permissions company-specific | OK | `GET companies/:id/me` via scoped membership |
| Filters reset on company change | PARTIAL | Cache clear refetches; local `useState` filters on pages may persist until remount |

**Expected post-redesign behavior gaps:**

1. After company switch, if user was on `/statistics` and new company has `reports` disabled → user lands on `/` (selector behavior) but **deep links / bookmarked URLs** need guard to redirect.
2. Add `useCompanySwitchNavigation()` hook: on switch, evaluate current path against `getAdminNavItems` + route guard rules → redirect to `/` if forbidden.

### 3.3 Permissions and modules

| Check | Status | Evidence |
|-------|--------|----------|
| Permission types centralized | OK | `types/permissions.ts` (18 permissions) |
| Permission helpers | OK | `utils/permissions.ts` |
| Modules from backend | OK | `GET modules` per company |
| Route → module mapping | OK | `FeatureRouteGuard` props in `AppRoutes.tsx` |
| Sidebar-only hiding | OK | Routes still protected at guard level |
| Settings routes (no module flag) | OK | Permission-only (`users:manage`, `company:settings:update`) |
| Platform admin routes | OK | `requirePlatformAdmin` on `/platform/companies` |
| Forbidden UI | OK | `DisabledModuleState`, `NoPermissionState` |
| Duplicated permission checks in pages | MEDIUM | Action buttons re-check permissions inline |

**Recommended guard structure (target):**

```
ProtectedRoute (auth)
  → CompanyGate (tenant selection)
    → AppLayout (shell)
      → FeatureRouteGuard (module + permission)  // keep per-route
        → Page
```

Optional: `CompanyAccessContext` providing `{ modules, permissions, isLoading }` from layout to avoid N+1 hook calls.

### 3.4 React Query and cache

| Pattern | Status | Notes |
|---------|--------|-------|
| Company modules key | OK | `["company-modules", companyId]` |
| Modules staleTime | OK | 10 min (`company-modules-query.ts`) |
| Permissions staleTime | OK | 60s |
| List keys include companyId | OK | e.g. `["employees", companyId, filters]` |
| Lookups staleTime | OK | 30s |
| Default list staleTime | GAP | 0 — refetch on mount common |
| Company switch | OK | Full `queryClient.clear()` |
| Invalidation partial keys | OK | Often `["inventories"]` without companyId (still works) |
| Error → company selection | OK | `notifyCompanySelectionRequired` on `ACTIVE_COMPANY_REQUIRED` |

**Stable cache model (recommended):**

| Query family | Key shape | staleTime | Invalidate on |
|--------------|-----------|-----------|---------------|
| Company meta | `["company-modules", companyId]` | 10 min | module PATCH, company switch |
| Permissions | `["company-permissions", companyId]` | 5–10 min | company switch, role change |
| Lists | `[entity, companyId, filters]` | 30s–2 min | mutations, company switch |
| Details | `[entity, companyId, id]` | 30s–2 min | entity mutation |
| Lookups | `["lookups", type, companyId, query]` | 30s | optional on CRUD |

**Company switch sequence (target):**

1. Set `isCompanySwitching=true` (global UI blocks interaction)
2. `clearActiveCompany` or `selectCompany`
3. `queryClient.clear()` or `removeQueries` except auth/companies list
4. Navigate to `/` or safe route
5. Clear `isCompanySwitching`

### 3.5 Styling and UI library

| Aspect | Current state |
|--------|---------------|
| Primary UI | MUI 7 components + `sx` |
| Theme | `theme/theme.ts` — primary `#1565c0`, secondary `#00897b`, bg `#f7f9fc` |
| Design tokens | Embedded in MUI theme only; no CSS variables |
| Global CSS | `index.css`, `App.css` exist but **not imported** |
| Mantine 9 | Installed (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications` ^9.4.1) |
| Responsiveness | MUI Grid v2 (`size={{ xs, md }}`), `useMediaQuery` in layout |

**Mantine adoption (decided):** Mantine 9 is mandatory and installed. Use the **shell-first strangler pattern**:

1. **PR 1** — ✅ `MantineProvider` + tokens (MUI nested inside)
2. **PR 2** — ✅ Mantine `AppShell` at route level; legacy MUI pages in `<Outlet />`
3. **PR 3+** — `src/design-system/` components; migrate pages progressively
4. **Final PR** — Remove MUI after all usages gone

Full detail: [frontend-mantine-adoption-plan.md](./frontend-mantine-adoption-plan.md).

### 3.6 Forms and validation

| Pattern | Usage |
|---------|-------|
| react-hook-form + zodResolver | Employee, Store, Inventory, Attendance test forms |
| Controlled MUI state | Company settings, company users dialog, platform company create |
| Filter state (`useState`) | All list pages |

**Keep intact:** All Zod schemas in `schemas/` — redesign must not weaken validation.

**Recommendation:** Standardize on RHF + Zod for new forms; migrate settings dialogs in Phase 5.

### 3.7 Responsive behavior

| Area | Current | Gap |
|------|---------|-----|
| Sidebar | Drawer on `xs–sm`, permanent on `md+` | OK |
| Topbar | Compact company selector on mobile | OK |
| Tables | Horizontal scroll via `TableContainer`; no card fallback | MEDIUM on mobile |
| Filters | `ListFilters` + `Grid`; varies by page | MEDIUM — some pages dense |
| Bot simulator | `Grid` stacks on `xs` | OK |
| Statistics | Heavy tables + charts | HIGH risk on small screens |
| Forms | MUI full-width fields | OK |

---

## 4. Risks

| # | Risk | Level | Mitigation |
|---|------|-------|------------|
| 1 | Dual UI libraries (MUI + Mantine) bloat and style conflicts | High | Shell-only Mantine or stay on MUI theme extension |
| 2 | Breaking route guards during layout refactor | High | Keep `FeatureRouteGuard` on routes; add integration tests |
| 3 | Stale company data flash after switch | Medium | Switching overlay + `queryClient.clear()` + redirect |
| 4 | Per-page `AdminLayout` removal breaks pages | Medium | Migrate to route layout in one PR with grep verification |
| 5 | Table migration breaks pagination/sort | Medium | Migrate one list page as template first |
| 6 | Bot simulator / import flows are complex | High | Phase 4 only; manual QA checklist |
| 7 | Statistics + ECharts layout regressions | Medium | Lazy-loaded; test export + filters |
| 8 | Redesign spec not in repo | High | Import spec + token mapping before coding |
| 9 | `DataTable` under-adoption → duplicate components | Medium | Expand `DataTable` rather than create parallel `DataTable` in Mantine |
| 10 | Google Maps location picker tightly coupled to MUI | Medium | Wrap, don't replace in early phases |

---

## 5. Existing components inventory

| Current component | Location | Used by | Overlaps redesign? | Recommendation |
|-------------------|----------|---------|-------------------|----------------|
| `AdminLayout` | `layouts/AdminLayout.tsx` | All protected pages | AppLayout, Sidebar, Topbar | **Replace** → route-level `AppLayout` |
| `CompanySelector` | `components/company/CompanySelector.tsx` | AdminLayout, selection page | CompanySelector | **Wrap** (keep logic) |
| `CompanySelectionPage` | same file | CompanyGate | Company selector full page | **Wrap** |
| `CompanyGate` | `components/company/CompanyGate.tsx` | ProtectedLayout | — | **Keep** |
| `FeatureRouteGuard` | `components/company/FeatureRouteGuard.tsx` | AppRoutes | Route guards | **Keep** (restyle forbidden states) |
| `ModuleRouteGuard` | `components/company/ModuleRouteGuard.tsx` | *(unused)* | — | **Delete later** |
| `ProtectedRoute` | `components/auth/ProtectedRoute.tsx` | AppRoutes | — | **Keep** |
| `PageHeader` | `components/common/PageHeader.tsx` | Most pages | PageHeader | **Wrap** |
| `ListFilters` / `FilterItem` | `components/common/ListFilters.tsx` | List pages | FilterBar | **Refactor** → FilterBar alias |
| `DataTable` | `components/common/DataTable.tsx` | 2 consumers only | DataTable | **Refactor** — adopt on all lists |
| `PaginationControls` | `components/common/PaginationControls.tsx` | Lists, DataTable | — | **Keep** |
| `SortableTableHead` | `components/common/SortableTableHead.tsx` | Some lists | — | **Keep** |
| `ClickableTableRow` | `components/common/ClickableTableRow.tsx` | List pages | — | **Keep** |
| `LoadingState` | `components/common/LoadingState.tsx` | Widespread | LoadingState | **Wrap** |
| `ErrorState` | `components/common/ErrorState.tsx` | Widespread | ErrorState | **Wrap** |
| `EmptyState` | `components/common/EmptyState.tsx` | Tables, lists | EmptyState | **Wrap** |
| `ConfirmDialog` | `components/common/ConfirmDialog.tsx` | Detail pages | ConfirmDialog | **Wrap** |
| `FeedbackSnackbar` | `components/common/FeedbackSnackbar.tsx` | Forms, actions | Toasts | **Keep** |
| `StatusChip` | `components/common/StatusChip.tsx` | Lists, details | StatusBadge | **Wrap** → StatusBadge |
| `StatusCard` | `components/StatusCard.tsx` | HomePage | MetricCard | **Wrap** → MetricCard |
| `DetailFieldGrid` | `components/common/DetailFieldGrid.tsx` | Detail pages | — | **Keep** |
| `FormActions` | `components/common/FormActions.tsx` | Domain forms | — | **Keep** |
| `SearchField` | `components/common/SearchField.tsx` | Lists | FilterBar | **Keep** |
| `DateRangeFilter` | `components/common/DateRangeFilter.tsx` | Attendance, statistics | FilterBar | **Keep** |
| `*LookupAutocomplete` | `components/lookups/` | Forms, statistics | — | **Keep** (domain-specific) |
| `StoreLocationPicker` | `components/stores/location-picker/` | Store form | — | **Keep** until Phase 5+ |
| Statistics components | `components/statistics/` | StatisticsPage | Charts, tables | **Refactor** in Phase 4 |
| Bot simulator components | `pages/bot-simulator/components/` | BotSimulatorPage | — | **Keep** logic; restyle shell Phase 4 |

---

## 6. Routing / navigation analysis

### Route protection matrix

| Route | Auth | Company | Module | Permission |
|-------|------|---------|--------|------------|
| `/login` | Public | — | — | — |
| `/` | Yes | Yes | — | — |
| `/employees/*` | Yes | Yes | any of attendance, inventory_operations, absences | employees:read/manage |
| `/stores/*` | Yes | Yes | inventory_operations | stores:read/manage |
| `/inventories/*` | Yes | Yes | inventory_operations | inventories:read/manage |
| `/attendance/*` | Yes | Yes | attendance | attendance:read/review/export |
| `/absences/*` | Yes | Yes | absences | absences:read/review |
| `/statistics` | Yes | Yes | reports | reports:read/export |
| `/bot-simulator` | Yes | Yes | bot_simulator | bot_simulator:use |
| `/settings/users` | Yes | Yes | — | users:manage |
| `/settings/company` | Yes | Yes | — | company:settings:update |
| `/platform/companies` | Yes | Yes | — | platform admin |

**Manual URL to forbidden route:** User sees in-page "Módulo no habilitado" or "Sin permisos" with link to `/` — **not** a redirect. Acceptable; redesign may unify forbidden page component.

**Browser routes vs API aliases:** UI routes remain `/stores`, `/inventories`; API uses `/locations`, `/operations` (Phase 2.8). Redesign must **not rename browser routes** without explicit approval.

---

## 7. Multi-company readiness — detailed

### Current flow

1. Login → `AuthProvider` loads user
2. `CompanyProvider` fetches `GET /companies` (memberships)
3. If 1 company → auto-select
4. If 2+ companies → restore from `localStorage` or show `CompanySelectionPage`
5. `setRuntimeCompanyId` → all `scopedApiClient` calls prefixed

### CompanySelector behavior (`CompanySelector.tsx`)

- Header dropdown when `companies.length > 1`
- On change: `selectCompany(id)` → `queryClient.clear()` → `navigate("/")`

### Gaps for safe CompanySelector (redesign target)

| Requirement | Current | Action |
|-------------|---------|--------|
| Globally available active company | Yes | — |
| Modules loaded once per company | Yes (React Query) | Document in layout context |
| Invalidate on switch | Yes (`clear`) | Consider selective remove |
| Hide unavailable modules | Yes (nav + guards) | — |
| Redirect if route unavailable | Partial (only via navigate `/`) | Add path validation hook |
| No stale data flash | Partial | Add switching state + skeleton |
| No refetch modules every route | Fixed | Monitor with React Query Devtools in QA |

---

## 8. Permissions / modules — detailed

**Single source of truth for nav:** `getAdminNavItems()` in `utils/company-modules.ts`.

**Duplication risk:** `AppRoutes.tsx` repeats module/permission rules as `FeatureRouteGuard` props. Rules must stay **in sync** with `getAdminNavItems`. Consider extracting shared route metadata:

```typescript
// Future: routes.config.ts
{ path: "/employees", moduleKeys: [...], permissions: [...] }
```

Used by both `AppRoutes` and `getAdminNavItems` — **recommended in Phase 1C**, not required for first visual pass.

---

## 9. React Query / cache — detailed

### `useCompanyModules` call sites

1. `AdminLayout` → `NavList`
2. `FeatureRouteGuard` → every protected feature route
3. `HomePage` → quick links
4. `CompanySettingsPage` → module toggles
5. `ModuleRouteGuard` (unused)

With shared query key, **network**: one fetch per company per 10 min. **UI**: multiple `isPending` checks may show loading in guard and layout simultaneously on first load.

### Query enablement pattern

`useOperationalQueryEnabled()` returns `{ companyId, enabled: Boolean(companyId) && !isLoading }` — prevents queries before company ready. **Keep this pattern** in all operational hooks.

---

## 10. Page-by-page impact matrix

| Area / Page | Current route | Main components | Data dependencies | Redesign impact | Risk | Recommendation |
|-------------|---------------|-----------------|-------------------|-----------------|------|----------------|
| Dashboard / Inicio | `/` | `HomePage`, `StatusCard`, `PageHeader` | health, modules, permissions, inventories | Visual + MetricCard | Low | **Phase 3** — template page |
| Operations list | `/inventories` | `InventoriesListPage`, filters, table | `useInventories`, permissions | Table + FilterBar | Medium | Phase 3 after DataTable adoption |
| Operation detail | `/inventories/:id` | `InventoryDetailPage`, `InventoryOperationalSection`, forms | inventory, assignments, attendance summary | High complexity | **High** | **Phase 4** |
| Operation create | `/inventories/new` | `InventoryForm` | stores, lookups | Form layout | Medium | Phase 3 |
| Import masivo | `/inventories/import` | `InventoryImportPage` | file upload, preview API | Wizard UI | **High** | Phase 4 |
| Attendance list | `/attendance` | `AttendanceListPage`, date filters | attendance list | Table + filters | Medium | Phase 4 |
| Attendance detail | `/attendance/:id` | reviews, `DataTable` | attendance, reviews | Detail + table | Medium | Phase 4 |
| Attendance create | `/attendance/new` | `AttendanceTestForm` | employees, inventories | Form | Medium | Phase 4 |
| Bot simulator | `/bot-simulator` | session panels, chat, location dialog | bot API, presets | Custom layout | **High** | Phase 4 — logic frozen |
| Employees list | `/employees` | hand-rolled table | `useEmployees` | Table standardization | Medium | Phase 3 |
| Employee CRUD | `/employees/new`, `/:id` | `EmployeeForm` | RHF + Zod | Form | Low–Med | Phase 3 |
| Stores list | `/stores` | list + filters | `useStores` | Table | Medium | Phase 3 |
| Store CRUD | `/stores/new`, `/:id` | `StoreForm`, `StoreLocationPicker` | maps, geolocation | **High** (maps) | Phase 4–5 |
| Absences list | `/absences` | filters, table | absence requests | Table | Medium | Phase 4 |
| Absence detail | `/absences/:id` | balances, actions | absence, balances | Detail | Medium | Phase 4 |
| Statistics | `/statistics` | tabs, charts, export | multiple statistics hooks | Charts + dense filters | **High** | Phase 4 |
| Company settings | `/settings/company` | modules toggles, settings form | modules, settings | Forms + toggles | Medium | Phase 5 |
| Company users | `/settings/users` | user table, dialog | company users API | Table + dialog | Medium | Phase 5 |
| Platform companies | `/platform/companies` | platform admin table | platform API | Low traffic | Low | Phase 5 |
| Login | `/login` | `LoginPage` | auth | Standalone layout | Low | Phase 2 or 3 |
| Company selection | *(no route)* | `CompanySelectionPage` | companies list | Full-page UX | Medium | Phase 1C |
| 404 | `*` | `NotFoundPage` | — | Visual | Low | Phase 2 |

---

## 11. Recommended target architecture

```
main.tsx
  ThemeProvider(s)           // MUI and/or Mantine
  QueryClientProvider
  BrowserRouter
    AuthProvider
      CompanyProviderGate
        AppRoutes
          /login
          ProtectedLayout
            ProtectedRoute
              CompanyGate
                AppLayout          // NEW: route layout (sidebar + topbar)
                  Outlet
                    FeatureRouteGuard (per route)
                      Page (no layout wrapper)
```

**Shared contexts (optional Phase 1C):**

```typescript
CompanyAccessContext {
  modules, permissions, isPlatformAdmin,
  isLoadingModules, isLoadingPermissions
}
```

**Component layering:**

```
design-system/     // thin wrappers: MetricCard, StatusBadge, FilterBar
  └── wraps components/common/* or Mantine primitives
pages/             // compose design-system + hooks only
hooks/             // unchanged
api/               // unchanged
```

---

## 12. Proposed phased implementation plan

### Phase 0 — Audit and preparation (current)

- [x] Document architecture (this file)
- [ ] Import/link official redesign spec + Figma/tokens
- [ ] Decision: Mantine vs MUI theme extension
- [ ] Decision: route metadata centralization

### Phase 1A — UI foundation

- Install/configure chosen UI foundation **only if decided**
- Add design tokens (colors, spacing, typography, radii)
- Parallel theme providers if Mantine shell + MUI pages
- **No page migrations**

### Phase 1B — Layout shell

- Create `AppLayout` (Topbar, Sidebar, main content area)
- Move `AdminLayout` logic into route layout in `AppRoutes.tsx`
- Remove per-page `<AdminLayout>` wrappers (mechanical refactor)
- Preserve mobile drawer behavior
- **All routes must still work identically**

### Phase 1C — Company and modules state

- Optional `CompanyAccessContext` from layout
- `useCompanySwitchNavigation` — validate route after switch
- Company switching overlay to prevent stale flashes
- Align permissions `staleTime` with modules (optional)
- Delete or deprecate `ModuleRouteGuard`

### Phase 2A — Base components

- Wrap/refactor: `PageHeader`, `MetricCard` (from `StatusCard`), `StatusBadge` (from `StatusChip`), `LoadingState`, `ErrorState`, `EmptyState`, `ConfirmDialog`
- Unified forbidden-state page component
- Spanish copy audit pass

### Phase 2B — Data components

- Evolve `ListFilters` → `FilterBar`
- Evolve `DataTable` — sorting, empty/loading/error slots, responsive overflow
- Migrate **one** list page (e.g. `/employees`) as reference implementation

### Phase 3 — Low-risk page migration

- Home `/`
- Login `/login`
- Company selection page
- Employee list + CRUD
- Store list (not edit/map yet)
- Inventory list + create

### Phase 4 — Operational page migration

- Inventory detail + operational section
- Import flow
- Attendance list/detail/create
- Absences list/detail
- Bot simulator (UI only)
- Statistics

### Phase 5 — Settings, permissions, multi-company hardening

- Company settings + module toggles
- Company users
- Platform companies
- Store edit + Google Maps picker styling
- Route metadata single source of truth
- E2E/manual regression suite

### Phase 6 — Cleanup

- Remove `AdminLayout.tsx` if fully replaced
- Remove unused `ModuleRouteGuard`
- Remove dead `index.css` / `App.css`
- Remove MUI if fully migrated (only if Mantine path chosen)
- Delete legacy `sx` patterns per page

---

## 13. Quality gate checklist

Every redesign PR must pass:

### Automated

- [ ] `npm run lint` (frontend)
- [ ] `npm run build` (frontend)
- [ ] `npm test` (frontend unit tests)
- [ ] No new TypeScript errors

### Auth & company

- [ ] Login / logout
- [ ] Session restore on refresh
- [ ] Multi-company selection screen
- [ ] Company switch clears data and lands on safe route
- [ ] No stale data from previous company visible

### Navigation & access

- [ ] Sidebar items match enabled modules + permissions
- [ ] Direct URL to forbidden route shows forbidden state
- [ ] Platform admin routes restricted
- [ ] No duplicate module API calls on navigation (verify Network tab: one `modules` per company per session)

### Data UI

- [ ] Table filters reset appropriately
- [ ] Pagination works
- [ ] Sorting works where applicable
- [ ] Loading / error / empty states present
- [ ] Modals and confirm dialogs work

### Business flows (smoke)

- [ ] Inventory list → detail → assign employee
- [ ] Attendance review flow
- [ ] Bot simulator session + location
- [ ] CSV/XLSX import preview
- [ ] Statistics export
- [ ] Company settings save
- [ ] User create/deactivate

### Responsive

- [ ] Mobile: drawer navigation
- [ ] Tablet: collapsible sidebar
- [ ] Tables scroll or degrade gracefully

---

## 14. Open questions / blocking decisions

1. **Where is the redesign specification document?** Not found in repo. Need Figma link, token list, and component mapping before Phase 1A.
2. ~~**Mantine vs extend MUI?**~~ **Resolved:** Mantine mandatory; MUI temporary.
3. ~~**Full replacement or shell-only Mantine?**~~ **Resolved:** Shell-first, full replacement at end of migration.
4. **Rename browser routes?** Spec should confirm keeping `/inventories`, `/stores` vs operational naming in UI labels only (`terminology.ts` already abstracts copy).
5. **Centralize route metadata?** Recommended but optional; affects Phase 1C scope.
6. **Company switch: full cache clear vs selective invalidation?** Current `clear()` is safest; may increase refetch cost after switch.
7. **Mobile table strategy:** horizontal scroll vs card rows — needs design decision for list pages.
8. **Dark mode?** Not in current MUI theme; clarify if in scope.

---

## Requirements matrix (audit checklist)

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| Auth preserved | OK | `AuthContext`, `ProtectedRoute` |
| Company context | OK | `CompanyContext`, `CompanyGate` |
| Modules per company | OK | `useCompanyModules`, backend `GET modules` |
| Permissions / roles | OK | `FeatureRouteGuard`, `useCompanyPermissions` |
| API services unchanged | OK | Scoped client pattern established |
| React Query cache | OK | Company-scoped keys; modules cached |
| Routing structure | OK | `AppRoutes.tsx`; browser routes stable |
| Tables/filters/forms | PARTIAL | Primitives exist; inconsistent adoption |
| Business flows intact | OK | All major pages implemented |
| Redesign spec available | GAP | Not in repository |
| Mantine design system | PR 1–9 done | Foundation + shell + main lists; **hybrid product** — forms/detail/statistics/import/bot legacy |
| AppLayout route shell | OK | Mantine `AppLayout` route-level; `AdminLayout` deprecated/unused |
| Company switch route safety | RISK | Navigates `/` only from selector |
| No stale company data | RISK | Cache clear OK; no switching overlay |
| Responsive tables | GAP | Scroll only; no card fallback |
| Test coverage for UI | GAP | Unit tests for hooks/utils; few component tests |

---

## Architecture fit

The redesign should follow a **strangler fig pattern**:

1. **Shell first** — layout and navigation without touching page logic.
2. **Component wrappers** — adapt existing `components/common/*` rather than fork new names.
3. **Page-by-page** — one reference list page, then operational pages last.
4. **Never mix** business rule changes with visual PRs.

Existing patterns to preserve:

- `useOperationalQueryEnabled` gating
- `scopedApiClient` for API paths
- `FeatureRouteGuard` on routes
- Zod schemas for mutations
- `terminology.ts` for operational naming in UI

---

## Database / API / WhatsApp impact

| Layer | Impact |
|-------|--------|
| Database | **None** — frontend-only redesign |
| API contract | **None** — do not change endpoints or DTOs |
| WhatsApp / Twilio | **None** — bot simulator UI may change; webhook logic untouched |

---

## Suggested next command

**`/implement-dinamic-stage`** — continue with **PR 10 (Form controls foundation)** per [frontend-mantine-adoption-plan.md](./frontend-mantine-adoption-plan.md). Migration scores and gaps: [frontend-mantine-migration-audit-0-100.md](./frontend-mantine-migration-audit-0-100.md).

---

*Audit performed read-only against repository state 2026-07-01. No source files were modified except this document.*
