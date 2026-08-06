# Auditoría NAV — Navegación genérica entre entidades

**Fecha:** 2026-08-06  
**Proyecto:** dinamic-localizador  
**Alcance:** Frontend UI cross-entity mentions + DTO contracts necesarios  
**Estado de clasificación:** completo (0 PENDING)

---

## 1. Arquitectura (canonical)

| Pieza | Rol |
|-------|-----|
| `frontend/src/routes/navigable-entity-definitions.ts` → `NAVIGABLE_ENTITY_DEFINITIONS` | **Fuente canónica** de tipos navegables, `buildPath`, módulo y permisos |
| `frontend/src/components/entity-link/entity-route-registry.ts` | Alias del canónico + `resolveEntityDetailPath` / `normalizeEntityId` |
| `frontend/src/components/entity-link/evaluate-entity-link-access.ts` | Evaluación **pura** compartida por `EntityLink` y `FeatureRouteGuard` |
| `frontend/src/components/entity-link/EntityLinkAccessProvider.tsx` | Carga módulos/permisos una vez en el shell protegido |
| `frontend/src/components/entity-link/EntityLink.tsx` | `<Link>` tipado; `stopPropagation` default **`false`**; sin id/acceso → `<span className={entityPlain}>` |
| `frontend/src/routes/entity-route-access.ts` | Presets manage derivados de `featureAccessOf(...)` |
| `frontend/src/routes/AppRoutes.tsx` | Envuelve rutas tenant con `EntityLinkAccessProvider` |

**Entidades navegables:** `employee` · `service` · `workTeam` · `operation` · `attendance` · `absence` · `payrollReceipt` · `whatsappConversation`.

**Semántica WRONG→FIXED (esta entrega):**

1. `AbsenceDetailPage` — servicio y operación son enlaces **separados**; ya no hay fallback service→operation.
2. `WorkTeamDetailPage` usage — columna «Servicio» usa `entityType="service"` + `row.serviceId` (no operación).

**DTO fixes (UI-critical IDs):**

- `AttendanceByOperationRow.serviceId` (backend + frontend)
- `WorkTeamUsageRecord.serviceId` (backend + frontend)
- `DeactivationImpactAssignment.workTeamId` (backend impact + frontend type)

---

## 2. Leyenda de estados

| Estado | Significado |
|--------|-------------|
| `CONVERTED` | Mención de UI convertida a `EntityLink` (o equivalente canónico) |
| `NOT_APPLICABLE` | No corresponde `EntityLink` (self-nav, picker, chart deep-link, export, copy de diálogo, menú redundante, etc.) |
| `BLOCKED_MISSING_ID` | Falta ID estable en DTO para un caso UI-crítico |
| `BLOCKED_MISSING_ROUTE` | Existe mención con identidad, pero **no hay** ruta de detalle en `AppRoutes` |
| `BLOCKED_PERMISSION_MODEL` | Bloqueo por modelo de permisos distinto al registry (ninguno residual) |
| `PENDING` | **Prohibido** en esta matriz — todo clasificado |

---

## 3. Matriz NAV (exhaustiva)

| ID | archivo | componente | vista/ruta | desktop/mobile | entidad mostrada | campo | ID disponible | ruta esperada | permiso | módulo | estado | acción aplicada | motivo si no convierte |
|----|---------|------------|------------|----------------|------------------|-------|---------------|---------------|---------|--------|--------|-----------------|------------------------|
| NAV-001 | `pages/attendance/AttendanceListPage.tsx` | `AttendanceListPage` | `/attendance` | desktop | employee | `employee` / nombre | `employee.id` \|\| `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-002 | `pages/attendance/AttendanceListPage.tsx` | `AttendanceListPage` | `/attendance` | desktop | service | `service` / nombre | `service.id` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-003 | `pages/attendance/AttendanceListPage.tsx` | `AttendanceListPage` | `/attendance` | desktop | operation | fecha `scheduledStart` | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-004 | `pages/attendance/AttendanceListPage.tsx` | `AttendanceListPage` | `/attendance` | mobile | employee | `mobileCard.title` | `employee.id` \|\| `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-005 | `pages/attendance/AttendanceListPage.tsx` | `AttendanceListPage` | `/attendance` | mobile | service | field `service` | `service.id` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-006 | `pages/attendance/AttendanceListPage.tsx` | `AttendanceListPage` | `/attendance` | mobile | operation | field `operation` | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-007 | `pages/attendance/AttendanceDetailPage.tsx` | `AttendanceDetailPage` | `/attendance/:id` | desktop | employee | DetailField trabajador | `employee.id` \|\| `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-008 | `pages/attendance/AttendanceDetailPage.tsx` | `AttendanceDetailPage` | `/attendance/:id` | desktop | service | DetailField servicio | `service.id` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-009 | `pages/attendance/AttendanceDetailPage.tsx` | `AttendanceDetailPage` | `/attendance/:id` | desktop | operation | DetailField operación | `operationId` \|\| `operation.id` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-010 | `pages/absences/AbsencesListPage.tsx` | `AbsencesListPage` | `/absences` | desktop | employee | columna empleado | `employee.id` \|\| `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-011 | `pages/absences/AbsencesListPage.tsx` | `AbsencesListPage` | `/absences` | mobile | employee | `mobileCard.title` | `employee.id` \|\| `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-012 | `pages/absences/AbsenceDetailPage.tsx` | `AbsenceDetailPage` | `/absences/:id` | desktop | employee | DetailField empleado | `employee.id` \|\| `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-013 | `pages/absences/AbsenceDetailPage.tsx` | `AbsenceDetailPage` / affected ops | `/absences/:id` | desktop | service | columna Servicio | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` **separado** (fix: sin fallback a operation) | — |
| NAV-014 | `pages/absences/AbsenceDetailPage.tsx` | `AbsenceDetailPage` / affected ops | `/absences/:id` | desktop | operation | columna Operación | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` **separado** | — |
| NAV-015 | `pages/absences/AbsenceDetailPage.tsx` | `AbsenceDetailPage` / affected ops | `/absences/:id` | mobile | service | `mobileCard.title` | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-016 | `pages/absences/AbsenceDetailPage.tsx` | `AbsenceDetailPage` / affected ops | `/absences/:id` | mobile | operation | field operación | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-017 | `pages/payroll-receipts/PayrollReceiptsListPage.tsx` | `PayrollReceiptsListPage` | `/payroll-receipts` | desktop | employee | `employeeName` | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-018 | `pages/payroll-receipts/PayrollReceiptsListPage.tsx` | `PayrollReceiptsListPage` | `/payroll-receipts` | mobile | employee | `mobileCard.title` / nombre | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-019 | `pages/payroll-receipts/PayrollReceiptDetailPage.tsx` | `PayrollReceiptDetailPage` | `/payroll-receipts/:id` | desktop | employee | DetailField / nombre | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` (botón ad-hoc reemplazado) | — |
| NAV-020 | `pages/operations/OperationsListPage.tsx` | `OperationsListPage` | `/operations` | desktop | service | `serviceName` / identity | `serviceId` \|\| `service.id` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-021 | `pages/operations/OperationsListPage.tsx` | `OperationsListPage` | `/operations` | mobile | service | card título / servicio | `serviceId` \|\| `service.id` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-022 | `pages/operations/OperationDetailPage.tsx` | `OperationDetailPage` | `/operations/:id` | desktop | service | MetricCard / servicio | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` (reemplaza `Anchor` ad-hoc) | — |
| NAV-023 | `components/operations/OperationEmployeeTable.tsx` | `OperationEmployeeTable` | `/operations/:id` | desktop | employee | nombre colaborador | `employee.id` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-024 | `components/operations/OperationEmployeeTable.tsx` | `OperationEmployeeTable` | `/operations/:id` | desktop | workTeam | línea secundaria «Grupo» | `workTeamId` (assignment) | `/work-teams/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-025 | `components/operations/OperationEmployeeTable.tsx` | `OperationEmployeeTable` | `/operations/:id` | mobile | employee | card título | `employee.id` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-026 | `components/operations/OperationEmployeeTable.tsx` | `OperationEmployeeTable` | `/operations/:id` | mobile | workTeam | field grupo | `workTeamId` | `/work-teams/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-027 | `components/operations/OperationWorkdayDetailModal.tsx` | `OperationWorkdayDetailModal` | modal en `/operations/:id` | desktop+mobile | employee | `employeeName` | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-028 | `pages/work-teams/WorkTeamDetailPage.tsx` | `WorkTeamDetailPage` | `/work-teams/:id` | desktop | employee | integrantes `employee.name` | `employee.id` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-029 | `pages/work-teams/WorkTeamDetailPage.tsx` | `WorkTeamDetailPage` usage | `/work-teams/:id` | desktop | service | columna Servicio | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` **fix semántico** (antes mal enlazado) | — |
| NAV-030 | `pages/work-teams/WorkTeamDetailPage.tsx` | `WorkTeamDetailPage` usage | `/work-teams/:id` | desktop | operation | columna Operación | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-031 | `pages/work-teams/WorkTeamDetailPage.tsx` | `WorkTeamDetailPage` usage | `/work-teams/:id` | mobile | service | card / field servicio | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-032 | `pages/work-teams/WorkTeamDetailPage.tsx` | `WorkTeamDetailPage` usage | `/work-teams/:id` | mobile | operation | card / field operación | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-033 | `components/statistics/StatisticsEmployeeTable.tsx` | `StatisticsEmployeeTable` | `/statistics` (tab empleados) | desktop | employee | `employeeName` | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-034 | `components/statistics/StatisticsEmployeeTable.tsx` | `StatisticsEmployeeTable` | `/statistics` | mobile | employee | card título | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-035 | `components/statistics/StatisticsLocationTable.tsx` | `StatisticsLocationTable` | `/statistics` (tab ubicaciones) | desktop | service | `serviceName` | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-036 | `components/statistics/StatisticsLocationTable.tsx` | `StatisticsLocationTable` | `/statistics` | mobile | service | card título | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-037 | `components/statistics/StatisticsOperationTable.tsx` | `StatisticsOperationTable` | `/statistics` (tab operaciones) | desktop | operation | label operación | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` | — |
| NAV-038 | `components/statistics/StatisticsOperationTable.tsx` | `StatisticsOperationTable` | `/statistics` | desktop | service | `serviceName` | `serviceId` *(DTO fix)* | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` tras enriquecer DTO | — |
| NAV-039 | `components/statistics/StatisticsOperationTable.tsx` | `StatisticsOperationTable` | `/statistics` | mobile | operation | card título | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-040 | `components/statistics/StatisticsOperationTable.tsx` | `StatisticsOperationTable` | `/statistics` | mobile | service | field servicio | `serviceId` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-041 | `components/employees/EmployeeDeactivationDialog.tsx` | `EmployeeDeactivationDialog` | modal desactivación | desktop | operation | `operationName` | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-042 | `components/employees/EmployeeDeactivationDialog.tsx` | `EmployeeDeactivationDialog` | modal desactivación | desktop | workTeam | `workTeamName` (assignment) | `workTeamId` *(DTO fix)* | `/work-teams/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-043 | `components/employees/EmployeeDeactivationDialog.tsx` | `EmployeeDeactivationDialog` | modal desactivación | mobile | operation | `mobileCard.title` | `operationId` | `/operations/:id` | `operations:read`\|`manage` | operations | CONVERTED | `EntityLink` | — |
| NAV-044 | `components/employees/EmployeeDeactivationDialog.tsx` | `EmployeeDeactivationDialog` | modal desactivación | mobile | workTeam | field Grupo | `workTeamId` | `/work-teams/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-045 | `components/employees/EmployeeDeactivationDialog.tsx` | `EmployeeDeactivationDialog` | modal desactivación | desktop+mobile | workTeam | `activeWorkTeamMemberships` | `workTeamId` | `/work-teams/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` en texto resumen | — |
| NAV-046 | `pages/HomePage.tsx` | `HomePage` / op card | `/` (home) | desktop+mobile | service | título servicio en card | `serviceId` \|\| `service.id` | `/services/:id` | `services:read`\|`manage` | operations | CONVERTED | `EntityLink` + `stopPropagation` (card navega a operación) | — |
| NAV-047 | `pages/platform/observability/WhatsappConversationDetailPage.tsx` | `WhatsappConversationDetailPage` | `/platform/observability/whatsapp/:id` | desktop | employee | campo Empleado (summary) | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` (platform admin shell; enlace falla a texto si sin módulo/permiso tenant) | — |
| NAV-048 | `pages/platform/observability/WhatsappConversationDetailPage.tsx` | `WhatsappConversationDetailPage` | same | desktop | employee | tab Technical → Employee ID | `employeeId` | `/employees/:id` | `employees:read`\|`manage` | attendance\|operations\|absences | CONVERTED | `EntityLink` | — |
| NAV-049 | `pages/statistics/components/StatisticsGeneralTab.tsx` | chart «Servicios con más incidencias» | `/statistics` | desktop | service | bar label → navigate | `serviceId` | deep-link attendance filters | N/A (filtered list) | attendance | NOT_APPLICABLE | none | Chart deep-link intencional (`buildServiceAttendanceHref`); no es texto `EntityLink` |
| NAV-050 | `pages/statistics/components/StatisticsGeneralTab.tsx` | otros charts clickables (KPI/series) | `/statistics` | desktop | mixed | `onChartClick` → filtered routes | ids en series | deep-links stats/attendance | N/A | mixed | NOT_APPLICABLE | none | Navegación de chart ≠ hipervínculo de campo |
| NAV-051 | `components/statistics/StatisticsKpiCards.tsx` | `StatisticsKpiCards` | `/statistics` | desktop+mobile | absence aggregates | aria «Ver ausencias…» | N/A (filtro) | `/absences?...` | absences | absences | NOT_APPLICABLE | none | CTA de filtro agregado, no mención de entidad instancia |
| NAV-052 | `components/employees/EmployeeSearchAutocomplete.tsx` | pickers | formularios varios | desktop+mobile | employee | lookup select | lookup `id` | N/A (select) | N/A | N/A | NOT_APPLICABLE | none | Autocomplete/picker: selección, no navegación de lectura |
| NAV-053 | `components/services/ServiceSearchAutocomplete.tsx` | pickers | formularios varios | desktop+mobile | service | lookup select | lookup `id` | N/A | N/A | N/A | NOT_APPLICABLE | none | Idem picker |
| NAV-054 | `components/operations/OperationSearchAutocomplete.tsx` | pickers | formularios / bot-sim | desktop+mobile | operation | lookup select | lookup `id` | N/A | N/A | N/A | NOT_APPLICABLE | none | Idem picker |
| NAV-055 | `design-system/filters/FilterLookupInput.tsx` | filter lookups | listas filtrables | desktop+mobile | mixed | filter value | lookup ids | N/A | N/A | N/A | NOT_APPLICABLE | none | Input de filtro, no EntityLink |
| NAV-056 | `pages/employees/EmployeesListPage.tsx` | `EmployeesListPage` | `/employees` | desktop+mobile | employee | row self | `row.id` | `/employees/:id` | employees | modules | NOT_APPLICABLE | `onRowClick` → detalle self | Self row-click de listado primario; no double-link en celda nombre |
| NAV-057 | `pages/services/ServicesListPage.tsx` | `ServicesListPage` | `/services` | desktop+mobile | service | row self | `row.id` | `/services/:id` | services | operations | NOT_APPLICABLE | `onRowClick` → detalle self | Idem self-list |
| NAV-058 | `pages/operations/OperationsListPage.tsx` | `OperationsListPage` | `/operations` | desktop+mobile | operation | row self | `row.id` | `/operations/:id` | operations | operations | NOT_APPLICABLE | `onRowClick` → detalle operación | Self-nav de la fila; EntityLink solo en servicio cruzado (NAV-020/021) |
| NAV-059 | `pages/attendance/AttendanceListPage.tsx` | `AttendanceListPage` | `/attendance` | desktop+mobile | attendance | row self | `row.id` | `/attendance/:id` | attendance perms | attendance | NOT_APPLICABLE | `onRowClick` → detalle asistencia | Self-nav; EntityLinks en relaciones (NAV-001–006) |
| NAV-060 | `pages/absences/AbsencesListPage.tsx` | `AbsencesListPage` | `/absences` | desktop+mobile | absence | row self | `row.id` | `/absences/:id` | absences perms | absences | NOT_APPLICABLE | `onRowClick` → detalle ausencia | Self-nav |
| NAV-061 | `components/operations/OperationEmployeeTable.tsx` | row menu | `/operations/:id` | desktop | employee | menú «Ver colaborador» | `employee.id` | `/employees/:id` | same | same | NOT_APPLICABLE | menú conservado | Redundante con EntityLink en nombre (NAV-023); acción de menú útil en touch/a11y — no convertir a segundo EntityLink |
| NAV-062 | `components/operations/OperationEmployeeTable.tsx` | row menu | `/operations/:id` | desktop | absence | menú «Ver ausencia» / conflicto | `absenceRequestId` | `/absences/:id` | absences | absences | NOT_APPLICABLE | navigateWithListContext | Acción contextual de workflow, no mención textual primaria |
| NAV-063 | `components/operations/WorkdayEmployeeExpectationPanel.tsx` | panel | operación / workday | desktop | absence | link «Ver ausencia» | absence id | `/absences/:id` | absences | absences | NOT_APPLICABLE | CTA workflow | Misma categoría: acción, no label EntityLink |
| NAV-064 | `utils/employee-module-quick-links.ts` / EmployeeModuleQuickLinks | quick links | `/employees/:id` | desktop+mobile | attendance/absence lists | «Ver asistencias/ausencias» | employee id en query | listados filtrados | module gated | attendance/absences | NOT_APPLICABLE | filtered list links | No son hipervínculos a detalle de entidad cruzada; son atajos de módulo |
| NAV-065 | `pages/payroll-receipts/PayrollReceiptDetailPage.tsx` | `PageHeader` | `/payroll-receipts/:id` | desktop | employee | description/header copy | `employeeId` (si presente) | `/employees/:id` | — | — | NOT_APPLICABLE | header sin link duplicado | Evitar duplicar EntityLink del campo empleado (NAV-019) |
| NAV-066 | `components/operations/EndAssignmentDialog.tsx` | `EndAssignmentDialog` | modal | desktop+mobile | employee | confirm copy `employeeName` | (prop name only) | — | — | — | NOT_APPLICABLE | texto confirmación | Copy de diálogo de confirmación; no superficie de navegación |
| NAV-067 | export CSV (attendance / stats / charts) | export helpers | varias | N/A | mixed | columnas nombre en CSV | a veces id no exportado | N/A | N/A | N/A | NOT_APPLICABLE | none | Export tabular sin UI links |
| NAV-068 | `types/statistics.ts` → `AttendanceWorkdayDetailRow` | workday detail export/API | stats drill-down export | N/A (no EntityLink UI) | employee / service names | `employeeName`, `serviceName` | **IDs no en DTO** | `/employees/:id`, `/services/:id` | — | — | NOT_APPLICABLE | documentado | Superficie export/API-only sin tabla EntityLink; IDs serían follow-up opcional si se añade UI |
| NAV-069 | `pages/settings/*` Users | Company users UI | `/settings/users` | desktop+mobile | company user | nombre usuario | user id (si hay) | **no existe** `/settings/users/:id` | users manage | settings | BLOCKED_MISSING_ROUTE | plain text / dialogs | Sin vista de detalle por id |
| NAV-070 | `pages/platform/PlatformCompaniesPage.tsx` | platform companies | `/platform/companies` | desktop+mobile | platform company | `companyName` | company id | **no existe** detalle `/platform/companies/:id` | platform admin | platform | BLOCKED_MISSING_ROUTE | list + dialogs only | Sin ruta de detalle tenant/platform company |
| NAV-071 | employee category surfaces | settings categorías / badges | settings + employee forms | desktop+mobile | category | `category.name` | `categoryId` | **no existe** detalle categoría | — | — | BLOCKED_MISSING_ROUTE | plain text | Categorías solo vía diálogos settings |
| NAV-072 | `pages/absences/AbsenceDetailPage.tsx` | `AbsenceDetailPage` | `/absences/:id` | desktop | reviewer / user | `reviewerName` | `reviewedBy` (si) | **no existe** perfil usuario | — | — | BLOCKED_MISSING_ROUTE | plain text | Sin página de perfil de revisor/usuario global |
| NAV-073 | company switcher / invitations | CompanySwitcher etc. | shell | desktop+mobile | company | `companyName` | company id | settings company / switch | — | — | NOT_APPLICABLE | switcher UX | No es browse de entidad detalle; cambio de contexto |
| NAV-074 | `pages/work-teams/WorkTeamDetailPage.tsx` | usage requestedBy | `/work-teams/:id` | desktop | user | `requestedByName` | (nombre only) | perfil usuario | — | — | BLOCKED_MISSING_ROUTE | plain text | Misma clase que reviewerName — sin ruta de usuario |
| NAV-075 | inventory/legacy aliases | AppRoutes redirects | `/inventories*`, `/stores*` | N/A | operation/service | legacy paths | ids legacy | `/operations*`, `/services*` | — | — | NOT_APPLICABLE | redirects canónicos | No inventar entidades client/supplier/aisle; legacy ya redirige |
| NAV-076 | `components/entity-link/EntityLink.tsx` | fail-closed access | global | desktop+mobile | any registered | label | id presente pero acceso denegado | path registry | denied → span | denied | CONVERTED | plain `<span class=entityPlain>` | No es “bloqueo de matriz”: comportamiento correcto del componente (permiso/módulo) |

---

## 4. Totales

| Métrica | Cantidad |
|---------|----------|
| **Total detectadas** | **76** |
| **Convertidas (`CONVERTED`)** | **49** |
| **No aplican (`NOT_APPLICABLE`)** | **22** |
| **Bloqueadas por ID (`BLOCKED_MISSING_ID`)** | **0** |
| **Bloqueadas por ruta (`BLOCKED_MISSING_ROUTE`)** | **5** |
| **Bloqueadas por modelo de permiso (`BLOCKED_PERMISSION_MODEL`)** | **0** |
| **Pendientes (`PENDING`)** | **0** |

> Nota: NAV-068 clasificado como `NOT_APPLICABLE` (no hay UI EntityLink hoy). Si en el futuro se renderiza una tabla UI de workday detail, pasaría a `BLOCKED_MISSING_ID` hasta enriquecer el DTO — documentado como follow-up opcional, **no** UI-critical residual.

---

## 5. Permisos / fail-closed

- `evaluateEntityLinkAccess` es puro: loading → no link; module/permission/platform deny → texto.
- `FeatureRouteGuard` reutiliza la misma función + `EntityLinkAccessProvider` cuando está montado.
- Backend sigue siendo autoridad al abrir el detalle.

---

## 6. Referencias

- Router: `frontend/src/routes/AppRoutes.tsx`
- Canónico: `frontend/src/routes/navigable-entity-definitions.ts`
- Access presets: `frontend/src/routes/entity-route-access.ts`
- Path helpers: `frontend/src/utils/entity-routes.ts`
- Informe: `audit/entity-navigation-implementation-report.md`
- Validación: `audit/entity-navigation-validation.md`
