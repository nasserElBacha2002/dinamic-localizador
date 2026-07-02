# Frontend Mantine Adoption Plan

**Status:** `READY_TO_IMPLEMENT` (PR 1 complete; PR 2+ shell and components)  
**Date:** 2026-07-01  
**Related:** [frontend-redesign-audit.md](./frontend-redesign-audit.md)  
**Scope:** Safe, progressive introduction of Mantine as the mandatory design-system layer while MUI 7 remains operational during migration. **No full page migrations in this plan phase.**

---

## 1. Executive summary

Mantine is **mandatory** for the Dinamic Attendance frontend redesign. The current app is production-ready on **MUI 7** with solid multi-company architecture (Auth, CompanyContext, scoped APIs, route guards, React Query). **Mantine can be introduced safely** using a **strangler pattern**: new design-system components and the app shell in Mantine; legacy pages continue on MUI until migrated one by one.

**First implementation steps (no page redesign yet):**

1. **PR 1** — ✅ **Done** — Install Mantine 9, `MantineProvider`, CSS imports, `src/design-system/theme/` tokens (no page changes).
2. **PR 2** — ✅ **Done** — Mantine `AppLayout` (AppShell) at **route level**; legacy MUI pages render inside `<Outlet />`.
3. **PR 3+** — Mantine UI-only primitives, then progressive page migration.

**What stays legacy for now:** All page content, domain forms, tables, bot simulator, statistics, import flow, Google Maps picker, and all MUI `components/common/*` until explicitly migrated.

**Highest risks:** dual-library bundle/CSS conflicts, AppShell layout regression, z-index/portal clashes, accidental business-logic coupling in design-system components.

---

## 2. Why Mantine is mandatory

| Reason | Implication |
|--------|-------------|
| Product/design decision | New UI must align with redesign spec built around Mantine primitives |
| Consistent design system | AppShell, tokens, tables, forms, notifications from one library |
| Faster iteration on shell | Layout, navigation, and shared states migrate first |
| Long-term maintainability | Single target UI library after migration completes |

**This does not mean:** removing MUI immediately, rewriting hooks/APIs, or big-bang page migrations.

---

## 3. Current MUI dependency analysis

### 3.1 Installed packages

From `frontend/package.json`:

| Package | Version | Role |
|---------|---------|------|
| `@mui/material` | ^7.3.4 | All UI components |
| `@emotion/react` | ^11.14.0 | MUI styling engine |
| `@emotion/styled` | ^11.14.1 | MUI styled components |

**Not installed:** `@mui/icons-material`, `@mui/x-date-pickers`, `@mui/lab`.

### 3.2 Theme and global setup

| Item | Location | Notes |
|------|----------|-------|
| `ThemeProvider` | `src/main.tsx` | Wraps entire app |
| `CssBaseline` | `src/main.tsx` | MUI CSS reset |
| Theme config | `src/theme/theme.ts` | `createTheme` — primary `#1565c0`, secondary `#00897b`, bg `#f7f9fc` |
| Global CSS files | `src/index.css`, `src/App.css` | **Not imported** anywhere (dead files) |
| MUI `sx` prop | Widespread | Primary styling mechanism |

### 3.3 Usage footprint

- **~70 source files** import from `@mui/material`.
- **Only package used:** `@mui/material` (+ `@mui/material/styles` in theme).
- **No MUI icons** — text labels and native buttons used in layout/nav.
- **No mixing with active global CSS** — only Emotion + `sx`.

### 3.4 MUI dependency by area

| Area | MUI usage | Location | Risk if changed early | Recommendation |
|------|-----------|----------|----------------------|----------------|
| App bootstrap | `ThemeProvider`, `CssBaseline` | `main.tsx` | High — affects all screens | **Keep temporarily**; nest inside `MantineProvider` |
| MUI theme | `createTheme` | `theme/theme.ts` | Low in isolation | **Keep temporarily** until last MUI page removed |
| App shell | AppBar, Drawer, Toolbar, List | `layouts/AdminLayout.tsx` | High — nav + company selector | **Replace early** (PR 2) with Mantine AppShell |
| Company selector | Select, FormControl, Box | `components/company/CompanySelector.tsx` | Medium | **Wrap later** in PR 2 (Mantine Select in topbar) |
| Route guards UI | Paper, Button, Typography | `FeatureRouteGuard.tsx` | Medium | **Create new Mantine** forbidden states; keep MUI until PR 3 |
| Common: PageHeader | Box, Button, Stack | `components/common/PageHeader.tsx` | Low | **Create new Mantine** component (PR 3) |
| Common: Loading/Error/Empty | Box, Alert, CircularProgress | `components/common/*` | Low | **Create new Mantine** (PR 3); legacy stays for unmigrated pages |
| Common: DataTable | Table, TableContainer | `components/common/DataTable.tsx` | Medium | **Create new Mantine** (PR 4); legacy lists unchanged initially |
| Common: ListFilters | Grid | `components/common/ListFilters.tsx` | Medium | **Create new Mantine FilterBar** (PR 4) |
| Common: ConfirmDialog | Dialog | `components/common/ConfirmDialog.tsx` | Medium | **Create new Mantine** (PR 3) |
| Common: Pagination | TablePagination, Select | `components/common/PaginationControls.tsx` | Medium | **Create new Mantine** (PR 4) |
| Common: StatusChip | Chip | `components/common/StatusChip.tsx` | Low | **Create new Mantine StatusBadge** (PR 3) |
| StatusCard | Card, Chip | `components/StatusCard.tsx` | Low | **Create new Mantine MetricCard** (PR 3) |
| Login | Card, TextField, Button | `pages/LoginPage.tsx` | Medium | **Replace later** (PR 5+) |
| List pages (6+) | Table, Paper, Select, TextField | `pages/*ListPage.tsx` | High | **Do not touch yet** until DataTable/FilterBar exist |
| Domain forms | TextField, Select, Controller | `components/*Form.tsx` | High | **Do not touch yet** — RHF + Zod stay |
| Statistics | Tabs, Grid, Cards, Tables | `pages/statistics/*`, `components/statistics/*` | Very high | **Do not touch yet** |
| Bot simulator | Grid, Paper, TextField, Dialog | `pages/bot-simulator/**` | Very high | **Do not touch yet** |
| Import flow | Step UI, alerts, buttons | `pages/inventories/InventoryImportPage.tsx` | Very high | **Do not touch yet** |
| Store location picker | Alert, Card, TextField, Grid | `components/stores/location-picker/**` | Very high | **Do not touch yet** |
| Inventory detail | Cards, dialogs, operational section | `pages/inventories/InventoryDetailPage.tsx` | Very high | **Do not touch yet** |
| Settings | Switches, TextFields, module toggles | `pages/settings/*` | Medium | **Replace later** (PR 6+) |
| Feedback | Snackbar, Alert | `components/common/FeedbackSnackbar.tsx` | Medium | **Wrap later** → `@mantine/notifications` |
| ECharts | None (wrapper uses MUI Paper) | `components/statistics/ChartCard.tsx` | Medium | **Wrap later** — chart stays ECharts |

### 3.5 Risk of removing MUI too early

Removing `@mui/material` before **all ~70 files** are migrated would **break the build** and halt delivery. MUI must remain until:

1. No file imports `@mui/material`.
2. `ThemeProvider` / `CssBaseline` removed from `main.tsx`.
3. Quality gate passes on all routes without MUI.

**Estimated removal:** Phase 6+ (after all pages and domain components migrated).

---

## 4. Safe coexistence strategy (MUI + Mantine)

### 4.1 Principles

| Principle | Rule |
|-----------|------|
| Mantine owns new UI | All new/redesigned shared components live under `src/design-system/` |
| MUI owns legacy UI | Unmigrated pages keep existing MUI imports unchanged |
| No MUI removal until end | `@mui/material` stays in `package.json` |
| Business logic is UI-agnostic | Hooks, API, Zod, guards unchanged |
| Boundary at page/shell | Mix libraries at layout boundaries, not inside small components |

### 4.2 Acceptable temporarily

| Scenario | Example |
|----------|---------|
| Mantine shell wraps MUI page content | `AppLayout` (Mantine) → `<Outlet />` → `EmployeesListPage` (MUI) |
| Unmigrated page uses MUI DataTable | Until PR 4+ migrates that page |
| MUI Dialog on unmigrated detail page | Until that page is migrated |
| Dual providers at root | `MantineProvider` + MUI `ThemeProvider` |
| MUI `LoadingState` in `FeatureRouteGuard` | Until guard states move to Mantine (PR 3) |
| Login page full MUI while shell is Mantine | Login is outside protected layout |

### 4.3 Avoid

| Anti-pattern | Why |
|--------------|-----|
| Mantine `Button` + MUI `Dialog` in one new component | Two portals, z-index, focus trap conflicts |
| New `design-system/Button.tsx` that re-exports MUI | Defeats migration goal |
| Duplicating hooks for Mantine pages | Business logic drift |
| Second API client for Mantine | Breaks scoped company pattern |
| Rewriting Zod schemas for UI | Validation must stay identical |
| Migrating bot simulator/import in PR 1–2 | Unacceptable regression risk |

### 4.4 CSS coexistence

| Layer | Strategy |
|-------|----------|
| Mantine | Import `@mantine/core/styles.css` (and notifications) in `main.tsx` **before** app render |
| MUI | Keep `CssBaseline` inside MUI `ThemeProvider` for legacy subtree |
| Conflicts | Scope Mantine to `design-system` + `AppLayout`; reset conflicts via Mantine CSS layers if needed (PostCSS preset) |
| Vite | Add `postcss-preset-mantine` + `postcss-simple-vars` when installing Mantine (official Vite guide) |

**Rule of thumb:** Mantine styles apply globally; MUI Emotion injects per-component. Test login + one list page after PR 1 for double-reset/box-sizing issues.

---

## 5. Mantine provider and theme setup plan

### 5.1 Current provider tree (`src/main.tsx`)

```
StrictMode
└── ThemeProvider (MUI)          ← appTheme
    └── CssBaseline
        └── QueryClientProvider
            └── BrowserRouter
                └── AuthProvider
                    └── CompanyProviderGate
                        └── App → AppRoutes
```

`ProtectedLayout` (in `AppRoutes.tsx`):

```
ProtectedRoute → CompanyGate → Outlet
```

`AdminLayout` is **inside each page**, not in the router.

### 5.2 Target provider tree (after PR 1 — foundation only)

```
StrictMode
└── QueryClientProvider              ← unchanged; must wrap auth + data
    └── MantineProvider theme={mantineTheme}
        └── MantineNotifications     ← @mantine/notifications
            └── ThemeProvider (MUI)   ← KEEP during migration
                └── CssBaseline
                    └── BrowserRouter
                        └── AuthProvider
                            └── CompanyProviderGate
                                └── App → AppRoutes
```

**Why this order:**

- `QueryClientProvider` outermost among app state — matches TanStack recommendation; query cache survives UI theme.
- `MantineProvider` wraps MUI so Mantine portals/notifications work app-wide.
- MUI `ThemeProvider` remains for all legacy components without changes.
- Auth and Company contexts unchanged — no coupling to Mantine.

### 5.3 CSS imports (PR 1)

Add to `src/main.tsx` (top of file, before component imports):

```ts
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
// Defer until date migration:
// import "@mantine/dates/styles.css";
```

### 5.4 Vite / PostCSS (PR 1 — implemented)

Per [Mantine 9 Vite guide](https://mantine.dev/guides/vite/), `frontend/postcss.config.cjs` uses:

- `postcss-preset-mantine`
- `postcss-simple-vars` (breakpoint variables)

Dev dependencies: `postcss`, `postcss-preset-mantine`, `postcss-simple-vars`.

**Status:** Config is present and validated with `npm run build` on Mantine `^9.4.1`. No changes required for Mantine 9.

### 5.5 NPM packages (PR 1 — implemented)

```json
"@mantine/core": "^9.x",
"@mantine/hooks": "^9.x",
"@mantine/notifications": "^9.x"
```

Current installed versions: `^9.4.1` (see `frontend/package.json`).

Defer until filter/date migration:

```json
"@mantine/dates": "^9.x",
"dayjs": "^1.x"
```

**Do not remove:** `@mui/material`, `@emotion/react`, `@emotion/styled`. MUI remains active for all unmigrated pages during the strangler migration.

### 5.6 Files to create (PR 1 — no page usage yet)

```
src/design-system/
  theme/
    tokens.ts      # semantic color/spacing constants
    theme.ts       # createTheme override for Mantine
  index.ts         # re-exports (empty components until PR 3)
```

---

## 6. Design tokens mapping

### 6.1 Source tokens (redesign baseline)

| Token | Value |
|-------|-------|
| Primary | `#2563EB` |
| Background | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Border | `#E2E8F0` |
| Font | Inter |
| Text primary | `#0F172A` |
| Text secondary | `#64748B` |
| Success | `#16A34A` |
| Warning | `#F59E0B` |
| Danger | `#DC2626` |
| Info | `#0284C7` |

Legacy MUI theme (`theme/theme.ts`) uses different primary (`#1565c0`) — **expected visual drift** until MUI is removed.

### 6.2 Mantine theme mapping

Proposed `src/design-system/theme/tokens.ts`:

```ts
export const designTokens = {
  colors: {
    primary: "#2563EB",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    success: "#16A34A",
    warning: "#F59E0B",
    danger: "#DC2626",
    info: "#0284C7",
  },
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  radius: { sm: 6, md: 8, lg: 12 },
  spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 },
} as const;
```

Proposed `src/design-system/theme/theme.ts` structure:

```ts
import { createTheme, type MantineThemeOverride } from "@mantine/core";
import { designTokens } from "./tokens";

export const mantineTheme: MantineThemeOverride = createTheme({
  primaryColor: "blue",
  colors: {
    blue: [/* generate 10-shade scale anchored on #2563EB */],
    green: [/* anchored on success */],
    red: [/* anchored on danger */],
    yellow: [/* anchored on warning */],
  },
  fontFamily: designTokens.fontFamily,
  headings: {
    fontFamily: designTokens.fontFamily,
    fontWeight: "600",
  },
  defaultRadius: "md",
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  shadows: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.06)",
    md: "0 4px 12px rgba(15, 23, 42, 0.08)",
  },
  components: {
    AppShell: {
      styles: {
        main: { backgroundColor: designTokens.colors.background },
      },
    },
    Button: {
      defaultProps: { radius: "md" },
    },
    Card: {
      defaultProps: {
        radius: "md",
        withBorder: true,
        padding: "lg",
      },
    },
    Badge: {
      defaultProps: { radius: "sm", variant: "light" },
    },
    Table: {
      defaultProps: { striped: true, highlightOnHover: true },
    },
    Modal: {
      defaultProps: { radius: "md", overlayProps: { blur: 2 } },
    },
    TextInput: {
      defaultProps: { radius: "md" },
    },
    Select: {
      defaultProps: { radius: "md" },
    },
  },
});
```

### 6.3 Inter font

Load Inter via:

- Google Fonts link in `index.html`, or
- `@fontsource/inter` package

Apply in Mantine `fontFamily` and document in PR 1.

### 6.4 Semantic status colors (StatusBadge)

| Status type | Mantine color prop |
|-------------|-------------------|
| Success / active | `green` |
| Warning / pending review | `yellow` |
| Danger / rejected | `red` |
| Info / scheduled | `blue` |
| Neutral | `gray` |

---

## 7. New Mantine design-system layer

### 7.1 Folder structure

Aligned with existing conventions (`components/`, `layouts/`, `theme/`):

```
frontend/src/design-system/
  theme/
    tokens.ts
    theme.ts
  layout/
    AppLayout.tsx          # Mantine AppShell — route-level shell
    AppSidebar.tsx         # Nav from getAdminNavItems()
    AppTopbar.tsx          # Company selector, user, logout
    AppNavLink.tsx         # Active route styling
  components/
    PageHeader.tsx
    MetricCard.tsx
    StatusBadge.tsx
    SectionCard.tsx
    EmptyState.tsx
    LoadingState.tsx
    ErrorState.tsx
    ConfirmDialog.tsx
    DataTable.tsx          # UI-only table shell
    FilterBar.tsx
  index.ts
```

**Naming:** New Mantine components live in `design-system/`. Legacy MUI components remain in `components/common/` until deprecated.

### 7.2 Component rules

| Rule | Detail |
|------|--------|
| UI-only | No `useQuery`, no `scopedApiClient`, no permission checks inside |
| Props-driven | Data, loading, error, callbacks from parent page |
| Spanish copy | Passed as props or children; defaults in Spanish where sensible |
| No route awareness | Except `AppNavLink` / layout (router links OK in layout only) |
| Export via `index.ts` | Single import path for pages: `import { PageHeader } from "@/design-system"` |

### 7.3 Legacy parallel components during migration

| Legacy (MUI) | New (Mantine) | Coexistence period |
|--------------|---------------|-------------------|
| `components/common/PageHeader.tsx` | `design-system/components/PageHeader.tsx` | Until all pages migrated |
| `layouts/AdminLayout.tsx` | `design-system/layout/AppLayout.tsx` | PR 2 switches router; delete AdminLayout in Phase 6 |

**Do not** make legacy files re-export Mantine in PR 1–3 — avoids hidden migration and mixed dependencies.

---

## 8. Existing component migration strategy

| Existing component | Current UI | Used by | New Mantine equivalent | Migration strategy | Priority |
|--------------------|------------|---------|------------------------|-------------------|----------|
| `AdminLayout` | MUI | All protected pages | `design-system/layout/AppLayout` | Create Mantine; route-level; remove per-page wrapper in follow-up PRs | **Early** (PR 2) |
| `PageHeader` | MUI | Most pages | `design-system/PageHeader` | Create new; migrate pages incrementally | **Early** (PR 3) |
| `LoadingState` | MUI | Widespread | `design-system/LoadingState` | Create new; adopt in guards + lazy routes later | **Early** (PR 3) |
| `ErrorState` | MUI | Widespread | `design-system/ErrorState` | Create new | **Early** (PR 3) |
| `EmptyState` | MUI | Lists, tables | `design-system/EmptyState` | Create new | **Early** (PR 3) |
| `ConfirmDialog` | MUI | Detail pages | `design-system/ConfirmDialog` | Create new (Mantine Modal) | **Early** (PR 3) |
| `StatusChip` | MUI | Lists | `design-system/StatusBadge` | Create new | **Early** (PR 3) |
| `StatusCard` | MUI | HomePage | `design-system/MetricCard` | Create new | **Early** (PR 3) |
| `ListFilters` | MUI | List pages | `design-system/FilterBar` | Create new; migrate with list pages | **Medium** (PR 4) |
| `DataTable` | MUI | 2 files | `design-system/DataTable` | Create new; broader adoption in PR 4–5 | **Medium** (PR 4) |
| `PaginationControls` | MUI | Lists | Part of `DataTable` or `Pagination` wrapper | Create new | **Medium** (PR 4) |
| `SortableTableHead` | MUI | Some lists | Mantine `Table.Th` helper | **Later** | **Later** |
| `ClickableTableRow` | MUI | Lists | Row `onClick` pattern in DataTable | **Later** | **Later** |
| `SearchField` | MUI | Lists | Mantine `TextInput` in FilterBar | **Later** | **Medium** |
| `DateRangeFilter` | MUI | Attendance, stats | Mantine Dates (when package added) | **Later** | **Later** |
| `CompanySelector` | MUI | AdminLayout | Mantine `Select` in AppTopbar | Replace in AppLayout only | **Early** (PR 2) |
| `CompanySelectionPage` | MUI | CompanyGate | Mantine cards/buttons | **Medium** (PR 5) | **Medium** |
| `FeatureRouteGuard` states | MUI | All feature routes | Mantine Paper/Stack | Restyle in PR 3 | **Medium** |
| `FeedbackSnackbar` | MUI | Forms | `@mantine/notifications` | **Later** | **Later** |
| `FormActions` | MUI | RHF forms | Mantine Button Group | **Later** (with form migration) | **Later** |
| `EmployeeForm` etc. | MUI + RHF | CRUD pages | Mantine inputs + same RHF | **Later** | **Do not touch yet** |
| `*Dialog` (domain) | MUI | Various | Mantine Modal per migration | **Later** | **Do not touch yet** |
| `ChartCard` | MUI + ECharts | Statistics | Mantine Card wrapper | **Later** | **Do not touch yet** |

---

## 9. Layout migration strategy

### 9.1 Current state

- Router: `ProtectedRoute` → `CompanyGate` → `Outlet` (no chrome).
- Each page: `<AdminLayout>…</AdminLayout>` manually.
- Nav: `getAdminNavItems()` in `AdminLayout` → `NavList`.
- Modules: `useCompanyModules()` in layout + guards (cached via React Query).

### 9.2 Target router structure (PR 2)

```tsx
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <CompanyGate>
        <AppLayout>           {/* Mantine AppShell — NEW */}
          <Outlet />
        </AppLayout>
      </CompanyGate>
    </ProtectedRoute>
  );
}
```

### 9.3 AppLayout responsibilities (Mantine)

| Feature | Implementation |
|---------|----------------|
| Sidebar | `AppShell.Navbar` + `AppSidebar` |
| Topbar | `AppShell.Header` + `AppTopbar` |
| Company selector | Mantine `Select` — same `selectCompany()` + `navigate("/")` |
| User / logout | `useAuth()` — unchanged |
| Navigation | `getAdminNavItems()` — **same function**, no duplicated rules |
| Module-aware nav | Single `useCompanyModules()` + `useCompanyPermissions()` in AppLayout |
| Responsive | `useMediaQuery` from `@mantine/hooks` — burger + `AppShell` collapsed mobile |
| Content padding | Consistent `AppShell.Main` padding |
| Outlet | `{children}` or `<Outlet />` via router |

### 9.4 PR 2 migration steps (safe)

1. Create `design-system/layout/AppLayout.tsx` (Mantine AppShell).
2. Insert `AppLayout` in `ProtectedLayout` wrapping `Outlet`.
3. **Keep** `<AdminLayout>` inside pages temporarily — creates double shell.

**PR 2b (same or next PR):** Remove `<AdminLayout>` from all pages mechanically (grep-driven). Pages render content only; shell is route-level.

### 9.5 What must not change in layout PR

- Route paths in `AppRoutes.tsx`
- `FeatureRouteGuard` wrappers per route
- `CompanyGate` behavior
- `getAdminNavItems()` logic (optional: extract shared `CompanyAccessContext` in PR 2b)
- Module query key / `staleTime` (`company-modules-query.ts`)

### 9.6 Avoiding module refetch on navigation

| Mechanism | Action |
|-----------|--------|
| React Query cache | Keep `companyModulesQueryOptions` (10 min staleTime) |
| Single layout subscriber | AppLayout calls `useCompanyModules` once; pass to sidebar via props/context |
| FeatureRouteGuard | Keep own hook — shares cache, no extra network if stale |
| Optional optimization | `CompanyAccessContext` in PR 2b to unify loading state |

---

## 10. Module and company state hardening

### 10.1 Must preserve (non-negotiable)

| Behavior | Current implementation | Mantine migration rule |
|----------|------------------------|------------------------|
| Active company | `CompanyContext.activeCompany` | **Do not change** |
| Persistence | `dinamic.activeCompanyId` in localStorage | **Do not change** |
| API scoping | `scopedApiClient` + `setRuntimeCompanyId` | **Do not change** |
| Switch invalidation | `queryClient.clear()` on `selectCompany` | **Do not change** |
| Switch redirect | `navigate("/")` in CompanySelector | **Keep**; enhance with route validation |
| Module cache | `["company-modules", companyId]`, 10 min stale | **Do not change** |
| Permissions cache | `["company-permissions", companyId]`, 60s | **Do not change** |
| Route guards | `FeatureRouteGuard` | **Do not change** logic |
| Nav filtering | `getAdminNavItems()` | **Same function** for Mantine sidebar |
| Query gating | `useOperationalQueryEnabled()` | **Do not change** |

### 10.2 Enhancements (PR 2b / Phase 1C — not blocking PR 1)

| Enhancement | Purpose |
|-------------|---------|
| `useCompanySwitchNavigation()` | After switch, if current path forbidden for new company → redirect `/` |
| `isCompanySwitching` flag | Overlay to prevent stale flash |
| Reset page-local filter state | Document pattern: keys on `companyId` in `useState` init or remount on switch |
| `CompanyAccessContext` | Single modules/permissions source for layout + optional guard reads |

### 10.3 Expected behavior checklist

- [ ] One `GET modules` per company per stale window (verify Network tab)
- [ ] Sidebar matches enabled modules + permissions
- [ ] Guards use same module/permission data as sidebar
- [ ] Company switch clears cached operational data
- [ ] No data from company A visible after switching to B
- [ ] Forbidden deep links show forbidden UI or redirect

---

## 11. Page migration order (Mantine-specific)

### Early candidates

| Page | Route | Risk | Why | Approach |
|------|-------|------|-----|----------|
| Dashboard / Inicio | `/` | Low | Cards + links; good MetricCard pilot | PR 5 — Mantine MetricCard + PageHeader; keep hooks |
| Company selection | *(gate)* | Low | Standalone full-page UI | PR 5 — Mantine cards |
| Not found | `*` | Low | Static | PR 3–5 — Mantine typography/buttons |
| Forbidden states | *(guard)* | Low | Static | PR 3 — Mantine in FeatureRouteGuard |

### Medium-risk candidates

| Page | Route | Risk | Why | Approach |
|------|-------|------|-----|----------|
| Employees list | `/employees` | Medium | Reference list migration | PR 4–5 — DataTable + FilterBar |
| Stores list | `/stores` | Medium | Filters + table | After employees template |
| Inventories list | `/inventories` | Medium | Core operational list | After stores |
| Attendance list | `/attendance` | Medium | Date filters | After Mantine Dates added |
| Absences list | `/absences` | Medium | Filters + status | Follow attendance |
| Company users | `/settings/users` | Medium | Table + dialog | Phase 5 |
| Employee CRUD | `/employees/*` | Medium | RHF forms stay; restyle inputs later | Phase 3–4 |
| Login | `/login` | Medium | Outside shell | Phase 3 — full Mantine card |

### Later candidates (do not touch early)

| Page | Route | Risk | Why | Approach |
|------|-------|------|-----|----------|
| Inventory detail | `/inventories/:id` | **High** | Command center, assignments, cancel | Phase 4+ |
| Import masivo | `/inventories/import` | **High** | Multi-step, file parsing UI | Phase 4+ |
| Bot simulator | `/bot-simulator` | **High** | Custom chat UI | Phase 4+ — shell only first |
| Statistics | `/statistics` | **High** | ECharts, tabs, export | Phase 4+ |
| Store edit + maps | `/stores/:id` | **High** | Google Maps integration | Phase 5+ |
| Attendance detail | `/attendance/:id` | **High** | Reviews, DataTable | Phase 4+ |
| Company settings | `/settings/company` | Medium–High | Module toggles | Phase 5 |

---

## 12. Suggested PR breakdown

### PR 1 — Mantine foundation only ✅ IMPLEMENTED

**Goal:** Install Mantine 9; wire provider + theme; zero page migration.

**Changes (done):**

- Add `@mantine/core`, `@mantine/hooks`, `@mantine/notifications` (`^9.4.1`)
- PostCSS config for Mantine 9 (`postcss-preset-mantine`, `postcss-simple-vars`)
- CSS imports in `main.tsx`
- `src/design-system/theme/tokens.ts`, `theme.ts` (colors, spacing, shadows)
- Wrap app with `MantineProvider` + `Notifications`
- Keep MUI `ThemeProvider` nested inside (MUI remains active)
- Inter font loading

**Validation:** `npm run build`, `npm run lint`, `npm test` pass.

---

### PR 2 — Mantine AppLayout shell ✅ IMPLEMENTED

**Goal:** Route-level AppShell; functional nav + company selector.

**Changes (done):**

- `design-system/layout/AppLayout`, `AppSidebar`, `AppTopbar`, `AppNavLink`
- Update `ProtectedLayout` in `AppRoutes.tsx`
- Remove per-page `AdminLayout` wrappers (all protected pages)
- Mantine company `Select` in topbar (same `selectCompany()` + `navigate("/")` behavior)
- `layouts/AdminLayout.tsx` retained but unused (delete in cleanup PR)

**Validation:** `npm run build`, `npm run lint`, `npm test` pass. Manual: navigation, company switch, guards, mobile drawer.

---

### PR 3 — Mantine base components

**Goal:** UI-only primitives; no complex page migration.

**Components:** PageHeader, MetricCard, StatusBadge, SectionCard, EmptyState, LoadingState, ErrorState, ConfirmDialog.

**Optional:** Restyle `FeatureRouteGuard` forbidden states with Mantine.

**Validation:** Storybook optional; unit smoke via one demo route or internal test page if needed.

---

### PR 4 — Mantine DataTable and FilterBar

**Goal:** List infrastructure; migrate **one** low-risk list if safe (employees recommended).

**Validation:** Pagination, search, loading/error/empty, sort if applicable.

---

### PR 5 — First page migration (Dashboard)

**Goal:** `HomePage` on Mantine components; hooks unchanged.

**Validation:** Health cards, quick links, upcoming operations match behavior.

---

### PR 6+ — Progressive module migration

One module area per PR where possible:

- PR 6: Employees list + CRUD forms (inputs Mantine + same RHF)
- PR 7: Stores list
- PR 8: Inventories list + create
- PR 9: Attendance list
- PR 10: Absences
- PR 11: Settings / users
- PR 12: Inventory detail
- PR 13: Import
- PR 14: Bot simulator
- PR 15: Statistics
- PR 16: Store edit / maps

### PR 17 — Remove MUI (final)

- Remove all `@mui/*` imports
- Remove MUI `ThemeProvider` from `main.tsx`
- Delete `theme/theme.ts`, `layouts/AdminLayout.tsx`, unused `components/common/*`
- Remove `@mui/material`, `@emotion/*` from package.json

---

## 13. Risks and mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bundle size (MUI + Mantine) | Medium | Track `vite build` chunk size; remove MUI in final PR; lazy routes unchanged |
| CSS reset conflicts | Medium | Test PR 1 on login + list; use Mantine PostCSS preset; document known overrides |
| Duplicate components | Medium | Clear `design-system/` vs `components/common/` ownership; migration table in this doc |
| Inconsistent UI during transition | Expected | Time-box phases; migrate shell + dashboard first |
| Mixing MUI + Mantine in one component | High | Code review rule; lint optional: ban `@mui` imports under `design-system/` |
| AppShell migration breaks layout | High | PR 2: route-level only; mechanical AdminLayout removal; visual QA checklist |
| Modal/z-index/portals | Medium | Use Mantine modals only in migrated pages; avoid cross-library dialogs |
| Date picker / locale | Medium | Add `@mantine/dates` + `dayjs` with `es` locale when migrating attendance filters |
| Form validation drift | High | **Never** change Zod schemas in UI PRs; RHF `Controller` pattern preserved |
| Table regressions | High | One reference list migration; compare row actions + pagination |
| Stale company data | High | Keep `queryClient.clear()`; add switching overlay in Phase 1C |
| Route guard regressions | High | No changes to guard logic in PR 1–2; manual forbidden-route QA |
| Accidental hook rewrites | High | PR template: "UI files only"; reviewers check for `useQuery` in design-system |
| Google Maps + Mantine layout | High | Defer store edit to Phase 5+ |
| ECharts theming | Low | Keep chart logic; swap card wrapper only |

---

## 14. Quality gate (every PR)

### Automated

- [ ] `npm run lint`
- [ ] `npm run build` (includes `tsc -b`)
- [ ] `npm test` (frontend unit tests)

### Manual — auth & company

- [ ] Login / logout
- [ ] Session restore on refresh
- [ ] Multi-company selection screen
- [ ] Company switch clears data and lands safely
- [ ] No stale data from previous company

### Manual — navigation & access

- [ ] Sidebar items match modules + permissions
- [ ] Direct URL to forbidden route → forbidden UI (not blank)
- [ ] Platform admin route restricted
- [ ] **Network:** no repeated `modules` fetch on normal navigation (within stale window)

### Manual — regression

- [ ] Existing **MUI** pages still render inside new shell (PR 2+)
- [ ] Tables, filters, pagination on unmigrated pages
- [ ] Modals on unmigrated detail pages
- [ ] Bot simulator / import / statistics untouched pages still work

### Manual — responsive

- [ ] Desktop: sidebar + topbar visible
- [ ] Mobile: drawer navigation works
- [ ] No horizontal overflow regressions on main content

### Contract

- [ ] No API path or payload changes
- [ ] No route path renames
- [ ] No permission/module logic changes without explicit approval

---

## 15. What must not be touched yet

| Area | Until |
|------|-------|
| `api/*`, `scoped-client.ts`, `company-path.ts` | Always |
| `hooks/*` (domain data fetching) | Always during UI PRs |
| `schemas/*`, Zod validation | Always during UI PRs |
| `FeatureRouteGuard` logic | PR 3+ for UI only |
| Bot simulator pages/components | Phase 4 PR |
| Import flow | Phase 4 PR |
| Statistics + ECharts | Phase 4 PR |
| Inventory detail / operational section | Phase 4 PR |
| Store location picker / Google Maps | Phase 5 PR |
| Domain forms (Employee, Store, Inventory) | Phase 3–4 per module |
| `@mui/material` removal | Final PR |
| `index.css` / `App.css` deletion | Phase 6 (already unused) |
| Browser route paths | Unless explicitly approved |

---

## 16. Open decisions before implementation

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Inter font delivery | Google Fonts vs `@fontsource/inter` | `@fontsource/inter` for offline/CI consistency |
| 2 | Path alias for design-system | `@/design-system` vs relative | Add `paths` in `tsconfig` if not present |
| 3 | PR 2: double shell transition | Single PR vs 2a/2b | **2a** add AppLayout route; **2b** remove AdminLayout from pages |
| 4 | CompanyAccessContext | PR 2 vs PR 3 | PR 2b optional optimization |
| 5 | Mantine Dates package | PR 4 vs when attendance migrates | When first date-heavy list migrates |
| 6 | Notifications migration | Replace FeedbackSnackbar globally vs per-page | Per-page during migration |
| 7 | Redesign Figma/spec link | External doc | Link in repo before PR 3 |
| 8 | Mobile table pattern | Horizontal scroll vs card rows | Design decision before PR 4 |
| 9 | `ModuleRouteGuard` | Delete vs keep | Delete in cleanup PR (unused) |
| 10 | Login page timing | PR 3 vs PR 5 | PR 5 — after shell stable |

---

## 17. Update to frontend redesign audit

The [frontend-redesign-audit.md](./frontend-redesign-audit.md) is superseded on these points:

| Audit topic | Previous | Updated |
|-------------|----------|---------|
| Design system | "Mantine vs MUI TBD" | **Mantine mandatory** |
| Phase 1A | Optional foundation | **Mantine install required** |
| Coexistence | Three options listed | **Dual provider strategy** (this doc) |
| Status | `NEEDS_CLARIFICATION` | **`READY_TO_IMPLEMENT`** for PR 1–2 |

---

*Document prepared for Dinamic Attendance frontend. No application code changed — planning only.*
