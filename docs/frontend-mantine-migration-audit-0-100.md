# Frontend Mantine Migration Audit 0–100

**Date:** 2026-06-23  
**Status:** `IN_PROGRESS`  
**Overall migration score:** 76/100  
**Last updated after PR 15** (2026-06-23)  
**Companion:** [frontend-mantine-migration-audit.json](./frontend-mantine-migration-audit.json)

---

## Executive summary

The Mantine migration **foundation is solid** (providers, tokens, `AppLayout` shell, design-system primitives, main list tables + filters, simple/complex forms, store maps, inventory detail, statistics). The **product remains visually hybrid** on import, bot simulator, company settings, attendance/absence detail shells, and legacy dialogs.

| Metric | Count |
|--------|------:|
| Routes/screens audited | 24 |
| Fully migrated (score 90–100) | 7 |
| Mostly migrated (score 80–89) | 9 |
| Hybrid (score 40–79) | 5 |
| Legacy / mostly legacy (score 0–39) | 3 |
| Infrastructure (shell/design-system) at 100 | 1 |

**Biggest blockers**

1. **Form-control + filter foundation exists** (PR 10–11). Store form/maps (PR 12). Inventory detail (PR 13). Statistics (PR 14). **Bot simulator (PR 15).** Remaining: import, company settings, attendance/absence detail shells, legacy dialogs.
2. **Detail pages** — attendance and absence detail still mix Mantine header actions with MUI cards, grids, and tables.
3. **Complex flows partially migrated** — statistics, store maps, and bot simulator done; import preview still legacy.
4. **Legacy internals** — `DateRangeCalendar` (MUI) inside Mantine date filter popover; `EmployeeAbsenceBalanceCard` and review dialogs remain MUI.
5. **Dual-library bundle** — reduced MUI usage (23 import lines); `ThemeProvider` remains in `main.tsx` until PR 19.

**Recommended next PR:** **PR 16 — Import Flow Migration**.

---

## Global scan results (2026-06-23)

Run from `frontend/`:

| Scan | Line matches | Notes |
|------|-------------:|-------|
| `@mui/material` in `src/**/*.tsx` | 23 | Down from 25 post-PR 14 |
| Table patterns (`TableContainer`, `<Table`, `TableHead`, …) | 152 | Down from 272; statistics tables migrated |
| Form patterns (`TextField`, `FormControl`, `InputLabel`, `MenuItem`, `Switch`) | 18 | Down from 206; legacy tables/cards still use some MUI |
| Dialog patterns (`DialogTitle`, `DialogContent`, `DialogActions`, `Dialog `) | 11 | Review modals, user/company dialogs, balance edit, bot location |
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
| Inventory detail | `/inventories/:id` · `InventoryDetailPage.tsx` | 88 | Mostly migrated | none on page shell | design-system `DataTable` in ops | migrated | migrated edit form | ConfirmDialog migrated | Critical | Cleanup |
| Absence detail | `/absences/:id` · `AbsenceDetailPage.tsx` | 40 | Hybrid | Card, Grid, Typography | affected inventories MUI table | Mantine header actions | review modal inputs | review dialog | High | PR 17 |
| Attendance detail | `/attendance/:id` · `AttendanceDetailPage.tsx` | 38 | Hybrid | Card, DetailFieldGrid | review history MUI table | Mantine header actions | review dialog fields | `ReviewAttendanceDialog` | High | PR 17 |
| Employee edit | `/employees/:id` · `EmployeeEditPage.tsx` | 65 | Hybrid | absence MUI cards/dialog | legacy balance table | migrated form | migrated | balance dialog | Medium | PR 17 |
| Employee create | `/employees/new` · `EmployeeCreatePage.tsx` | 85 | Mostly migrated | none | n/a | migrated | migrated | n/a | Low | Cleanup |
| Store create | `/stores/new` · `StoreCreatePage.tsx` | 92 | Mostly migrated | none | n/a | migrated header + form | migrated two-column layout | n/a | High | Cleanup |
| Store edit | `/stores/:id` · `StoreEditPage.tsx` | 92 | Mostly migrated | none | n/a | migrated header + form | migrated two-column layout | n/a | High | Cleanup |
| Inventory create | `/inventories/new` · `InventoryCreatePage.tsx` | 78 | Mostly migrated | none | n/a | migrated | migrated | n/a | Medium | Cleanup |
| Attendance create | `/attendance/new` · `AttendanceCreatePage.tsx` | 75 | Mostly migrated | none | n/a | migrated | migrated | n/a | Medium | Cleanup |
| Company selection | (gate) · `CompanySelector.tsx` | 78 | Mostly migrated | none | n/a | migrated | n/a | n/a | Low | Cleanup |
| Company settings | `/settings/company` · `CompanySettingsPage.tsx` | 18 | Legacy | cards, switches, typography | n/a | MUI save actions | MUI form fields | n/a | Medium | PR 12 |
| Statistics | `/statistics` · `StatisticsPage.tsx` | 90 | Migrated | none | design-system `DataTable` | Mantine exports | migrated `FilterBar` | n/a | Critical | Cleanup |
| Inventory import | `/inventories/import` · `InventoryImportPage.tsx` | 12 | Legacy | full MUI page | preview MUI table | MUI buttons | MUI file/upload UI | n/a | High | PR 16 |
| Bot simulator | `/bot-simulator` · `BotSimulatorPage.tsx` | 92 | Migrated | none | n/a | Mantine actions | Mantine inputs | Mantine `Modal` | Critical | Cleanup |
| Login | `/login` · `LoginPage.tsx` | 88 | Mostly migrated | outside shell | n/a | migrated | migrated | n/a | Medium | Cleanup |

### Nested / section components (non-route)

| Component | Used by | Score | Status | Notes | Recommended PR |
|-----------|---------|------:|--------|-------|----------------|
| `InventoryOperationalSection` | Inventory detail | 88 | Mostly migrated | design-system `DataTable` | Cleanup |
| `EmployeeAbsenceHistoryTable` | Employee edit | 88 | Mostly migrated | Design-system `DataTable` | Cleanup |
| `EmployeeAbsenceBalanceCard` | Employee edit | 25 | Legacy | MUI table + edit dialog | PR 17 |
| `ReviewAttendanceDialog` | Attendance detail | 20 | Legacy | MUI Dialog + TextField | PR 17 |
| `CompanyUserDialog` | Company users | 20 | Legacy | Full MUI form dialog | PR 17 |
| `CreatePlatformCompanyDialog` | Platform companies | 20 | Legacy | Full MUI form dialog | PR 17 |
| `BotLocationDialog` | Bot simulator | 92 | Migrated | Mantine modal + coordinate inputs | Cleanup |
| `ExportActionButtons` | Statistics | 95 | Migrated | Mantine buttons | Cleanup |
| `DateRangeFilter` | List pages | 85 | Mostly migrated | Mantine shell; custom panel uses legacy `DateRangeCalendar` | Cleanup |
| `EmployeeLookupAutocomplete` / `StoreLookupAutocomplete` / `InventoryLookupAutocomplete` | Lists, forms | 85 | Mostly migrated | Mantine via `FilterLookupInput` | Cleanup |
| `EmployeeSearchAutocomplete` | Filters | 85 | Mostly migrated | Mantine via `FilterLookupInput` | Cleanup |
| `StoreForm` + `StoreLocationPicker` + map sections | Store create/edit | 90 | Migrated | Mantine UI; Google Maps logic unchanged | — |
| Statistics tables / filters / charts | Statistics | 90 | Migrated | Mantine layout + ECharts data unchanged | Cleanup |
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
| `/stores/:id` | 88 | none on form/map | Maps Mantine shell; geofencing logic untouched | Cleanup |
| `/inventories` | 76 | legacy date/store filters | Filter styling mismatch | PR 10 |
| `/inventories/:id` | 88 | none on shell | Mantine command center + aligned edit form | Cleanup |
| `/attendance` | 74 | legacy filters | Filter styling mismatch | PR 10 |
| `/attendance/:id` | 38 | MUI cards, review table, review dialog | Review flow legacy | PR 17 |
| `/absences` | 74 | legacy filters | Filter styling mismatch | PR 10 |
| `/absences/:id` | 40 | MUI layout, inventories table, review modal | Detail layout legacy | PR 17 |
| `/statistics` | 90 | none on statistics stack | Mantine dashboard + ECharts wrappers | Cleanup |
| `/bot-simulator` | 92 | 3-column console layout | Cleanup only |
| `/settings/company` | 18 | switches, text fields, save buttons | Settings form legacy | PR 11 |
| `/settings/users` | 80 | user dialog | Dialog blocks full migration | PR 17 |
| `/platform/companies` | 84 | create company dialog | Dialog blocks full migration | PR 17 |

---

## Remaining MUI by category

### Remaining MUI tables

| File | Why it remains |
|------|----------------|
| `components/absences/EmployeeAbsenceBalanceCard.tsx` | Balance summary + edit flow |
| `pages/absences/AbsenceDetailPage.tsx` | Affected inventories table |
| `pages/attendance/AttendanceDetailPage.tsx` | Review history table |
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
| `components/attendance/AttendanceTestForm.tsx` | Manual attendance create |
| `components/common/DateRangeFilter.tsx`, `DateRangeCalendar.tsx` | Shared list filters (calendar popover still MUI) |
| `components/common/SearchAutocomplete.tsx` + lookup wrappers | Employee/store/inventory search |
| `pages/settings/CompanySettingsPage.tsx` | Company settings form |
| `pages/settings/CompanyUserDialog.tsx` | User admin form |
| `pages/platform/CreatePlatformCompanyDialog.tsx` | Platform admin form |
| `components/attendance/ReviewAttendanceDialog.tsx` | Review notes/fields |
| `pages/LoginPage.tsx` | Auth form |

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
| `pages/attendance/AttendanceDetailPage.tsx` | MUI Card layout |
| `pages/absences/AbsenceDetailPage.tsx` | MUI Card/Grid layout |
| `components/common/DetailFieldGrid.tsx` | Detail field layout |
| `pages/bot-simulator/BotSimulatorPage.tsx` | Panel layout |
| `pages/inventories/InventoryImportPage.tsx` | Wizard layout |
| `components/StatusCard.tsx` | Legacy status presentation |

### Remaining MUI detail sections

| File | Why it remains |
|------|----------------|
| `EmployeeAbsenceBalanceCard` | Employee absence balances on edit page |
| `EmployeeAbsenceHistoryTable` | **Mostly migrated** (design-system table) |
| Attendance/absence detail review sections | Cards + tables + modals |

---

## Migration gaps confirmed (review feedback)

These gaps were explicitly verified in this audit:

1. **Employee edit page** (`/employees/:id`) — `EmployeeAbsenceBalanceCard` (MUI table + dialog). Score **65/100**.
2. **Store create/edit** — migrated (PR 12). Score **92/100**.
3. **Inventory detail** (`/inventories/:id`) — Mantine command center + aligned edit form (PR 13 + PR 14 corrections). Score **88/100**.
4. **Statistics** (`/statistics`) — Mantine dashboard: filters, KPIs, tabs, charts, DataTable (PR 14). Score **90/100**.
5. **Detail sections** — attendance and absence detail pages still use MUI tables/cards/dialogs.

**Documentation accuracy:** PR 7 and PR 8 improved main lists and safe actions but did **not** complete tables/buttons/dialogs globally. See corrected roadmap below.

---

## PR 11 — Shared filter inputs + simple forms (2026-06-23)

**Status:** IMPLEMENTED (partial — `CompanySettingsPage` deferred)

**Created:** `design-system/filters/*` — `FilterSelect`, `FilterDateRangeInput`, `FilterLookupInput`, `FilterActions`.

**Migrated:** list filters on attendance/inventories/absences; `SearchAutocomplete` + `DateRangeFilter` wrappers; `InventoryForm`, `AttendanceTestForm`, `LoginPage`, `CompanySelector`, `EmployeeEditPage` header.

**Deferred:** `CompanySettingsPage`, `StoreForm`/maps, statistics filters, `DateRangeCalendar` internals (MUI).

**Next:** PR 13 — Inventory detail / operational command center.

---

## PR 12 — Complex forms + maps (2026-06-23)

**Status:** IMPLEMENTED

**Migrated:** `StoreCreatePage`, `StoreEditPage`, `StoreForm`, `StoreLocationPicker`, `ManualCoordinatesFields`, `LocationMapSection` (→ `LocationAddressSearch` + `LocationMapCanvas`).

**Preserved:** `useLocationPickerState`, Google Maps loader/Places/geocoding, `store.schema.ts`, API payloads, default radius, navigation.

**Grep (target files):** zero `@mui/material` in store pages, `StoreForm`, and `location-picker/**`.

**PR 12 correction:** Left/right layout (CSS grid `store-form-layout.module.css`); map panel min-height 520px desktop; search inside map panel only.

**Next:** PR 13 — Inventory detail / operational command center.

---

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
| **PR 12** | Complex forms + maps | Store create/edit, `StoreLocationPicker`, manual coordinates, map layout ✅ |
| **PR 13** | Inventory detail / operational command center ✅ | Detail layout, `InventoryOperationalSection` |
| **PR 14** | Statistics migration ✅ | Filters, tabs, tables, chart cards, export |
| **PR 15** | Bot simulator migration ✅ | 3-column console, chat, location dialog, technical panel |
| **PR 16** | Import flow migration | Import preview table and wizard layout |
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
