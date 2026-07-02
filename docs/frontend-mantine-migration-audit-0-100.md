# Frontend Mantine Migration Audit 0–100

**Date:** 2026-06-23  
**Status:** `IN_PROGRESS`  
**Overall migration score:** 54/100  
**Last updated after PR 11** (2026-06-23)  
**Companion:** [frontend-mantine-migration-audit.json](./frontend-mantine-migration-audit.json)

---

## Executive summary

The Mantine migration **foundation is solid** (providers, tokens, `AppLayout` shell, design-system primitives, main list tables + filters, simple forms). The **product remains visually hybrid** on detail pages, statistics, import, bot simulator, store maps, settings, and legacy dialogs.

| Metric | Count |
|--------|------:|
| Routes/screens audited | 24 |
| Fully migrated (score 90–100) | 5 |
| Mostly migrated (score 80–89) | 8 |
| Hybrid (score 40–79) | 6 |
| Legacy / mostly legacy (score 0–39) | 5 |
| Infrastructure (shell/design-system) at 100 | 1 |

**Biggest blockers**

1. **Form-control + filter foundation exists** (PR 10–11). Remaining blockers: `StoreForm`/maps, `CompanySettingsPage`, statistics, import flow, bot simulator, detail page shells, form dialogs.
2. **Detail pages** — inventory, attendance, and absence detail mix Mantine header actions with MUI cards, grids, and tables.
3. **Complex flows untouched** — statistics, import preview, bot simulator, store maps/location picker.
4. **Legacy internals** — `DateRangeCalendar` (MUI) inside Mantine date filter popover; `EmployeeAbsenceBalanceCard` and review dialogs remain MUI.
5. **Dual-library bundle** — reduced MUI usage; `ThemeProvider` remains in `main.tsx` until PR 19.

**Recommended next PR:** **PR 12 — Complex Forms + Maps** (store create/edit, location picker, company settings).

---

## Global scan results (2026-06-23)

Run from `frontend/`:

| Scan | Line matches | Notes |
|------|-------------:|-------|
| `@mui/material` in `src/**/*.tsx` | 56 | 54 component/page files + `main.tsx` + deprecated `AdminLayout.tsx` |
| Table patterns (`TableContainer`, `<Table`, `TableHead`, …) | 317 | Includes design-system Mantine tables and legacy MUI tables |
| Form patterns (`TextField`, `FormControl`, `InputLabel`, `MenuItem`, `Switch`) | 206 | Dominated by forms, filters, dialogs, settings |
| Dialog patterns (`DialogTitle`, `DialogContent`, `DialogActions`, `Dialog `) | 82 | Review modals, user/company dialogs, balance edit, bot location |
| `@mui/material` in `src/design-system` | **0** | Pass |
| API hooks in `src/design-system` | **0** | Pass |

---

## Route / screen score table

Scores reflect **visual/UI migration only** (not business logic). A page inside Mantine `AppLayout` can still score low if its content is legacy MUI.

| Area | Route / file | Score | Status | MUI remaining | Tables | Buttons / actions | Inputs / forms | Dialogs | Complexity | Recommended PR |
|------|--------------|------:|--------|---------------|--------|-------------------|----------------|---------|------------|----------------|
| App shell | `design-system/layout/AppLayout` | 100 | Migrated | none | n/a | migrated | n/a | n/a | Low | — |
| Home / dashboard | `/` · `HomePage.tsx` | 95 | Migrated | none | n/a | migrated | n/a | n/a | Low | Cleanup |
| Employees list | `/employees` · `EmployeesListPage.tsx` | 92 | Migrated | none | migrated | migrated | n/a (filters only) | n/a | Low | Cleanup |
| Stores list | `/stores` · `StoresListPage.tsx` | 92 | Migrated | none | migrated | migrated | n/a | n/a | Low | Cleanup |
| Not found | `*` · `NotFoundPage.tsx` | 90 | Migrated | none | n/a | migrated | n/a | n/a | Low | — |
| Platform companies | `/platform/companies` · `PlatformCompaniesPage.tsx` | 84 | Mostly migrated | create dialog | migrated | migrated + legacy create | legacy in dialog | `CreatePlatformCompanyDialog` | Medium | PR 17 |
| Company users | `/settings/users` · `CompanyUsersPage.tsx` | 80 | Mostly migrated | user dialog | migrated | migrated + legacy dialog | legacy in dialog | `CompanyUserDialog` | Medium | PR 17 |
| Inventories list | `/inventories` · `InventoriesListPage.tsx` | 88 | Mostly migrated | none on filters | migrated | migrated | migrated filters | n/a | Low | Cleanup |
| Attendance list | `/attendance` · `AttendanceListPage.tsx` | 88 | Mostly migrated | none on filters | migrated | migrated | migrated filters | n/a | Low | Cleanup |
| Absences list | `/absences` · `AbsencesListPage.tsx` | 88 | Mostly migrated | none on filters | migrated | migrated | migrated filters | n/a | Low | Cleanup |
| Inventory detail | `/inventories/:id` · `InventoryDetailPage.tsx` | 44 | Hybrid | Card, Typography, `PageHeader` | `InventoryOperationalSection` legacy table | Mantine header + legacy ops | `InventoryForm` | ConfirmDialog migrated | Critical | PR 13 |
| Absence detail | `/absences/:id` · `AbsenceDetailPage.tsx` | 40 | Hybrid | Card, Grid, Typography | affected inventories MUI table | Mantine header actions | review modal inputs | review dialog | High | PR 13, PR 17 |
| Attendance detail | `/attendance/:id` · `AttendanceDetailPage.tsx` | 38 | Hybrid | Card, DetailFieldGrid | review history MUI table | Mantine header actions | review dialog fields | `ReviewAttendanceDialog` | High | PR 13, PR 17 |
| Employee edit | `/employees/:id` · `EmployeeEditPage.tsx` | 65 | Hybrid | absence MUI cards/dialog | legacy balance table | migrated form | migrated | balance dialog | Medium | PR 17 |
| Employee create | `/employees/new` · `EmployeeCreatePage.tsx` | 85 | Mostly migrated | none | n/a | migrated | migrated | n/a | Low | Cleanup |
| Store create | `/stores/new` · `StoreCreatePage.tsx` | 22 | Legacy | `PageHeader` | n/a | `FormActions` | `StoreForm` + map deps | n/a | High | PR 12 |
| Store edit | `/stores/:id` · `StoreEditPage.tsx` | 22 | Legacy | `PageHeader`, map layout | n/a | `FormActions` | `StoreForm`, location picker | n/a | Critical | PR 12 |
| Inventory create | `/inventories/new` · `InventoryCreatePage.tsx` | 78 | Mostly migrated | none | n/a | migrated | migrated | n/a | Medium | Cleanup |
| Attendance create | `/attendance/new` · `AttendanceCreatePage.tsx` | 75 | Mostly migrated | none | n/a | migrated | migrated | n/a | Medium | Cleanup |
| Company selection | (gate) · `CompanySelector.tsx` | 78 | Mostly migrated | none | n/a | migrated | n/a | n/a | Low | Cleanup |
| Company settings | `/settings/company` · `CompanySettingsPage.tsx` | 18 | Legacy | cards, switches, typography | n/a | MUI save actions | MUI form fields | n/a | Medium | PR 12 |
| Statistics | `/statistics` · `StatisticsPage.tsx` | 14 | Legacy | Tabs, PageHeader, cards | 3 statistics tables | export partial (Mantine) | `StatisticsFiltersBar` | n/a | Critical | PR 14 |
| Inventory import | `/inventories/import` · `InventoryImportPage.tsx` | 12 | Legacy | full MUI page | preview MUI table | MUI buttons | MUI file/upload UI | n/a | High | PR 16 |
| Bot simulator | `/bot-simulator` · `BotSimulatorPage.tsx` | 10 | Legacy | full MUI layout | n/a | MUI actions | MUI inputs | `BotLocationDialog` | Critical | PR 15 |
| Login | `/login` · `LoginPage.tsx` | 88 | Mostly migrated | outside shell | n/a | migrated | migrated | n/a | Medium | Cleanup |

### Nested / section components (non-route)

| Component | Used by | Score | Status | Notes | Recommended PR |
|-----------|---------|------:|--------|-------|----------------|
| `InventoryOperationalSection` | Inventory detail | 55 | Hybrid | Mantine action buttons; MUI assignment table | PR 13 |
| `EmployeeAbsenceHistoryTable` | Employee edit | 88 | Mostly migrated | Design-system `DataTable` | Cleanup |
| `EmployeeAbsenceBalanceCard` | Employee edit | 25 | Legacy | MUI table + edit dialog | PR 17 |
| `ReviewAttendanceDialog` | Attendance detail | 20 | Legacy | MUI Dialog + TextField | PR 17 |
| `CompanyUserDialog` | Company users | 20 | Legacy | Full MUI form dialog | PR 17 |
| `CreatePlatformCompanyDialog` | Platform companies | 20 | Legacy | Full MUI form dialog | PR 17 |
| `BotLocationDialog` | Bot simulator | 15 | Legacy | MUI dialog + map fields | PR 15 |
| `ExportActionButtons` | Statistics | 70 | Hybrid | Mantine buttons; legacy context | PR 14 |
| `DateRangeFilter` | List pages | 85 | Mostly migrated | Mantine shell; custom panel uses legacy `DateRangeCalendar` | Cleanup |
| `EmployeeLookupAutocomplete` / `StoreLookupAutocomplete` / `InventoryLookupAutocomplete` | Lists, forms | 85 | Mostly migrated | Mantine via `FilterLookupInput` | Cleanup |
| `EmployeeSearchAutocomplete` | Filters | 85 | Mostly migrated | Mantine via `FilterLookupInput` | Cleanup |
| `StoreForm` + `StoreLocationPicker` + map sections | Store create/edit | 20 | Legacy | MUI + Google Maps | PR 12 |
| Statistics tables / filters / charts | Statistics | 12 | Legacy | Full MUI + ECharts wrappers | PR 14 |
| Import preview components | Import page | 12 | Legacy | MUI table/cards | PR 16 |

---

## Manual QA checklist (code inspection)

Screens were inspected via source review (dev server available; no live screenshot session in this PR). Permission-gated routes assumed reachable for admin test users.

| Route | Visual score | Major legacy elements | Blocking issues | Recommended PR |
|-------|-------------:|----------------------|-----------------|----------------|
| `/` | 95 | none | none | Cleanup |
| `/employees` | 92 | none on table | none | Cleanup |
| `/employees/:id` | 32 | `EmployeeForm`, balance card/table/dialog | Form UX inconsistent with lists | PR 11 |
| `/stores` | 92 | none on table | none | Cleanup |
| `/stores/:id` | 22 | `StoreForm`, map, location picker | Maps tied to MUI layout | PR 12 |
| `/inventories` | 76 | legacy date/store filters | Filter styling mismatch | PR 10 |
| `/inventories/:id` | 44 | MUI cards, operational table, edit form | Operational command center still legacy | PR 13 |
| `/attendance` | 74 | legacy filters | Filter styling mismatch | PR 10 |
| `/attendance/:id` | 38 | MUI cards, review table, review dialog | Review flow legacy | PR 13, PR 17 |
| `/absences` | 74 | legacy filters | Filter styling mismatch | PR 10 |
| `/absences/:id` | 40 | MUI layout, inventories table, review modal | Detail layout legacy | PR 13, PR 17 |
| `/statistics` | 14 | tabs, filters, tables, chart cards | Large surface; ECharts wrappers | PR 14 |
| `/bot-simulator` | 10 | full MUI panels + location dialog | Complex interactive UI | PR 15 |
| `/settings/company` | 18 | switches, text fields, save buttons | Settings form legacy | PR 11 |
| `/settings/users` | 80 | user dialog | Dialog blocks full migration | PR 17 |
| `/platform/companies` | 84 | create company dialog | Dialog blocks full migration | PR 17 |

---

## Remaining MUI by category

### Remaining MUI tables

| File | Why it remains |
|------|----------------|
| `components/inventories/InventoryOperationalSection.tsx` | Assignment/review table; actions partially migrated in PR 8 |
| `components/absences/EmployeeAbsenceBalanceCard.tsx` | Balance summary + edit flow |
| `pages/absences/AbsenceDetailPage.tsx` | Affected inventories table |
| `pages/attendance/AttendanceDetailPage.tsx` | Review history table |
| `components/statistics/StatisticsEmployeeTable.tsx` | Statistics domain table |
| `components/statistics/StatisticsInventoryTable.tsx` | Statistics domain table |
| `components/statistics/StatisticsLocationTable.tsx` | Statistics domain table |
| `pages/inventories/InventoryImportPage.tsx` | Import preview grid |
| `components/common/DataTable.tsx` | Legacy MUI table (superseded by design-system for migrated lists) |
| `components/common/SortableTableHead.tsx`, `ClickableTableRow.tsx` | Legacy table helpers |

### Remaining MUI buttons / actions

| File | Why it remains |
|------|----------------|
| `components/common/FormActions.tsx` | Submit/cancel pattern on all legacy forms |
| `pages/settings/CompanySettingsPage.tsx` | Save / reset actions |
| `pages/LoginPage.tsx` | Login submit |
| `pages/bot-simulator/**` | Simulator controls |
| `pages/inventories/InventoryImportPage.tsx` | Import workflow actions |
| `components/company/CompanySelector.tsx` | Company pick actions |
| Detail review modals | Approve/reject with legacy styling |

### Remaining MUI inputs / forms

| File | Why it remains |
|------|----------------|
| `components/employees/EmployeeForm.tsx` | Employee CRUD |
| `components/stores/StoreForm.tsx` | Store CRUD |
| `components/inventories/InventoryForm.tsx` | Inventory CRUD |
| `components/attendance/AttendanceTestForm.tsx` | Manual attendance create |
| `components/stores/location-picker/**` | Map + manual coordinates |
| `components/common/DateRangeFilter.tsx`, `DateRangeCalendar.tsx` | Shared list/statistics filters |
| `components/common/SearchAutocomplete.tsx` + lookup wrappers | Employee/store/inventory search |
| `pages/settings/CompanySettingsPage.tsx` | Company settings form |
| `pages/settings/CompanyUserDialog.tsx` | User admin form |
| `pages/platform/CreatePlatformCompanyDialog.tsx` | Platform admin form |
| `components/attendance/ReviewAttendanceDialog.tsx` | Review notes/fields |
| `pages/LoginPage.tsx` | Auth form |
| `components/statistics/StatisticsFiltersBar.tsx` | Statistics filter bar |

### Remaining MUI dialogs / modals

| File | Why it remains |
|------|----------------|
| `pages/settings/CompanyUserDialog.tsx` | Form-heavy user editor |
| `pages/platform/CreatePlatformCompanyDialog.tsx` | Platform company creator |
| `components/attendance/ReviewAttendanceDialog.tsx` | Attendance review |
| `components/absences/EmployeeAbsenceBalanceCard.tsx` | Balance adjustment dialog |
| `pages/bot-simulator/components/BotLocationDialog.tsx` | Simulated location picker |
| Absence detail review modal | Inline MUI Dialog in page |

### Remaining MUI cards / layout

| File | Why it remains |
|------|----------------|
| `components/common/PageHeader.tsx` | Legacy header on unmigrated pages |
| `pages/inventories/InventoryDetailPage.tsx` | MUI Card/Typography detail layout |
| `pages/attendance/AttendanceDetailPage.tsx` | MUI Card layout |
| `pages/absences/AbsenceDetailPage.tsx` | MUI Card/Grid layout |
| `pages/statistics/StatisticsPage.tsx` | MUI Tabs + layout |
| `components/statistics/ChartCard.tsx` | Chart wrapper cards |
| `components/common/DetailFieldGrid.tsx` | Detail field layout |
| `pages/bot-simulator/BotSimulatorPage.tsx` | Panel layout |
| `pages/inventories/InventoryImportPage.tsx` | Wizard layout |
| `components/StatusCard.tsx` | Legacy status presentation |

### Remaining MUI detail sections

| File | Why it remains |
|------|----------------|
| `InventoryOperationalSection` | Core inventory operations UI |
| `EmployeeAbsenceBalanceCard` | Employee absence balances on edit page |
| `EmployeeAbsenceHistoryTable` | **Mostly migrated** (design-system table) |
| Attendance/absence detail review sections | Cards + tables + modals |
| Statistics tabs (`StatisticsGeneralTab`, KPI cards) | Full legacy stack |

---

## Migration gaps confirmed (review feedback)

These gaps were explicitly verified in this audit:

1. **Employee edit page** (`/employees/:id`) — legacy `PageHeader`, `EmployeeForm` (MUI inputs), `EmployeeAbsenceBalanceCard` (MUI table + dialog). Score **32/100**.
2. **Store edit page** (`/stores/:id`) — legacy `StoreForm`, `StoreLocationPicker`, map sections (MUI + Google Maps). Score **22/100**.
3. **Inventory detail / edit operation** (`/inventories/:id`) — hybrid: Mantine header actions + design-system confirm; MUI cards, `InventoryForm`, `InventoryOperationalSection` table. Score **44/100**.
4. **Statistics** (`/statistics`) — legacy `PageHeader`, MUI tabs, `StatisticsFiltersBar`, three MUI tables, chart cards. Score **14/100**.
5. **Detail sections** — attendance, absence, and inventory detail pages still use MUI tables/cards/dialogs alongside partial Mantine migrations from PR 7–8.

**Documentation accuracy:** PR 7 and PR 8 improved main lists and safe actions but did **not** complete tables/buttons/dialogs globally. See corrected roadmap below.

---

## PR 11 — Shared filter inputs + simple forms (2026-06-23)

**Status:** IMPLEMENTED (partial — `CompanySettingsPage` deferred)

**Created:** `design-system/filters/*` — `FilterSelect`, `FilterDateRangeInput`, `FilterLookupInput`, `FilterActions`.

**Migrated:** list filters on attendance/inventories/absences; `SearchAutocomplete` + `DateRangeFilter` wrappers; `InventoryForm`, `AttendanceTestForm`, `LoginPage`, `CompanySelector`, `EmployeeEditPage` header.

**Deferred:** `CompanySettingsPage`, `StoreForm`/maps, statistics filters, `DateRangeCalendar` internals (MUI).

**Next:** PR 12 — Complex forms + maps.

---

## PR 10 — Form controls foundation (2026-06-23)

**Status:** IMPLEMENTED

**Created:** `design-system/forms/*` — RHF-wrapped Mantine inputs, layout (`FormSection`, `FormGrid`, `FormActions`, `FormErrorAlert`).

**`@mantine/dates`:** Deferred. `RHFDateTimeInput` uses native `datetime-local` string contract.

**Sample migrated:** `EmployeeForm` + `EmployeeCreatePage` header (employee create/edit form fields now Mantine).

**Forms still pending:** Store, inventory, attendance test, company settings, login, filters, dialogs, maps.

**Next:** PR 11 — Simple forms migration.

---

## Corrected roadmap

| PR | Title | Scope |
|----|-------|-------|
| **PR 9** | Full UI audit 0–100 + roadmap correction | **This PR** — audit docs only |
| **PR 10** | Form controls foundation | Mantine `TextInput`, `Select`, `Switch`, `DatePickerInput`, RHF adapters; no page migrations |
| **PR 11** | Simple forms migration | Employee create/edit, inventory create, attendance create, company settings, login |
| **PR 12** | Complex forms + maps | Store create/edit, `StoreLocationPicker`, manual coordinates, map layout |
| **PR 13** | Inventory detail / operational command center | Detail layout, `InventoryOperationalSection`, attendance/absence detail shells |
| **PR 14** | Statistics migration | Filters, tabs, tables, chart cards, export |
| **PR 15** | Bot simulator migration | Panels, chat, `BotLocationDialog` |
| **PR 16** | Import flow migration | `InventoryImportPage` preview and actions |
| **PR 17** | Complex dialogs / review flows | User/company dialogs, review modals, balance edit |
| **PR 18** | MUI cleanup | Legacy `components/common/*` wrappers, duplicate DataTable, unused AdminLayout |
| **PR 19** | Remove MUI (final) | Drop `@mui/*` from `package.json`, remove `ThemeProvider`, verify zero imports |

**Do not reuse old duplicate PR numbers** (e.g. the former “PR 9 Attendance list” entries are obsolete — those lists migrated in PR 7).

---

## Definition of done (full migration)

- No `@mui/material` imports in `src/pages`.
- No `@mui/material` imports in `src/components` except explicitly allowed compatibility wrappers (temporary; removed in PR 18–19).
- No MUI `Table` usage in product UI.
- No MUI `TextField` / `FormControl` / `Select` / `Switch` usage.
- No MUI `Dialog` usage.
- No MUI `Card` / `Typography` / `Grid` layout usage on routed pages.
- All routed pages visually aligned with Mantine `AppLayout` and design-system tokens.
- Forms use Mantine inputs integrated with React Hook Form + Zod (schemas unchanged).
- Complex flows (maps, statistics, bot, import) migrated without business-logic or API changes.
- `grep -R "@mui/material" src --include="*.tsx"` returns zero before removing packages.
- `src/design-system` remains free of MUI and data-fetching logic.

---

## Validation (PR 9)

| Check | Result |
|-------|--------|
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `npm test` | Pass (126/126) |
| Design-system: no MUI | Pass (0 imports) |
| Design-system: no API hooks | Pass (0 matches) |

---

## Known limitations

- Scores are based on **static code analysis** and structured manual inspection, not pixel-perfect screenshot comparison.
- Lazy-loaded pages (statistics, bot, import, some details) were audited via source, not runtime visual diff.
- Legacy `components/common/*` primitives are counted against pages that still import them even when the shell is Mantine.
- Overall score (46) is a **weighted judgment** (daily list/dashboard flows vs. infrequent complex flows), not a simple arithmetic mean of route scores.
