# Informe de implementación — Navegación genérica entre entidades

**Fecha:** 2026-08-06  
**Estado funcional:** `COMPLETE`  
**Auditoría de origen:** `audit/entity-navigation-audit.md`  
**Validación:** `audit/entity-navigation-validation.md`

---

## Resumen

Se entregó un sistema tipado de hipervínculos cruzados (`EntityLink`) respaldado por `NAVIGABLE_ENTITY_DEFINITIONS` como fuente canónica. Las menciones UI-críticas (asistencias, ausencias, recibos, operaciones, grupos, estadísticas, desactivación, home, WhatsApp observability) navegan al detalle cuando hay ID estable y acceso de módulo/permiso; si no, texto plano fail-closed.

Residuales formales (`BLOCKED_MISSING_ROUTE`: usuarios empresa, empresas plataforma, categorías, `reviewerName` / `requestedByName`) quedan **fuera de alcance** por decisión de producto (sin inventar rutas). No quedan `PENDING` ni `BLOCKED_MISSING_ID` UI-críticos.

---

## Arquitectura

```text
frontend/src/routes/navigable-entity-definitions.ts   # CANÓNICO: tipos + buildPath + access
frontend/src/routes/entity-route-access.ts            # presets manage derivados (featureAccessOf)
frontend/src/components/entity-link/
  EntityLink.tsx                      # Link tipado; stopPropagation default false; plain span
  EntityLink.module.css               # entityLink / entityPlain (inline-flex, ellipsis)
  EntityLinkAccessProvider.tsx        # modules+permissions once in protected shell
  evaluate-entity-link-access.ts      # pure evaluateEntityLinkAccess (shared w/ FeatureRouteGuard)
  use-entity-link-access.ts           # context-first, fallback queries for tests
  entity-route-registry.ts            # alias registry + resolveEntityDetailPath
  entity-link.types.ts
  index.ts
  *.test.ts(x)                        # unit + dto contracts + semantic invariants
frontend/src/components/company/FeatureRouteGuard.tsx # same pure evaluator
frontend/src/routes/AppRoutes.tsx     # EntityLinkAccessProvider wrapper
```

### Decisiones clave

| Decisión | Valor | Motivo |
|----------|-------|--------|
| Fuente canónica | `NAVIGABLE_ENTITY_DEFINITIONS` | Una sola definición para routes, links y tests |
| Access | `evaluateEntityLinkAccess` puro | Compartir lógica con `FeatureRouteGuard`; testable sin React |
| Provider | `EntityLinkAccessProvider` | Evitar N queries por celda en tablas densas |
| `stopPropagation` | default **`false`** | Opt-in solo en filas/cards clickeables |
| Sin id / denied / loading | `<span className={entityPlain}>` | Layout estable; fail-closed UX |
| Destino | solo detalle (no edit) | Evitar deep-links mutables por defecto |

---

## Registro de entidades

| Tipo | Path | Acceso |
|------|------|--------|
| `employee` | `/employees/:id` | anyModule attendance\|operations\|absences + `employees:read`\|`manage` |
| `service` | `/services/:id` | module `operations` + `services:read`\|`manage` |
| `workTeam` | `/work-teams/:id` | igual employee |
| `operation` | `/operations/:id` | module `operations` + `operations:read`\|`manage` |
| `attendance` | `/attendance/:id` | `MODULE_ROUTE_ACCESS.attendance` |
| `absence` | `/absences/:id` | `MODULE_ROUTE_ACCESS.absences` |
| `payrollReceipt` | `/payroll-receipts/:id` | `MODULE_ROUTE_ACCESS.payroll_receipts` |
| `whatsappConversation` | `/platform/observability/whatsapp/:id` | `requirePlatformAdmin` |

---

## Contratos DTO / backend

| Contrato | Cambio | Consumidor |
|----------|--------|------------|
| `AttendanceByOperationRow.serviceId` | **añadido** (backend repository + types FE/BE) | `StatisticsOperationTable` → EntityLink service |
| `WorkTeamUsageRecord.serviceId` | **añadido** (assignment-batch repo + types) | `WorkTeamDetailPage` usage Servicio |
| `DeactivationImpactAssignment.workTeamId` | **añadido** (impact util + types) | `EmployeeDeactivationDialog` grupo en assignments |

Archivos backend tocados (representativo):

- `backend/src/repositories/statistics.repository.ts`
- `backend/src/repositories/work-team-assignment-batch.repository.ts`
- `backend/src/repositories/employee-deactivation.repository.ts` (si aplica wiring)
- `backend/src/utils/employee-deactivation-impact.ts` (+ test)
- `backend/src/services/company-lifecycle.service.ts` (si impact path)
- `backend/src/types/statistics.ts`, `backend/src/types/work-team.ts`
- Frontend mirrors: `frontend/src/types/statistics.ts`, `work-team.ts`, `employee-deactivation.ts`

---

## Fixes semánticos (WRONG → FIXED)

1. **AbsenceDetail affected ops** — columnas/campos **service** y **operation** son `EntityLink` independientes. Eliminado cualquier fallback que tratara el nombre de servicio como enlace a operación.
2. **WorkTeamDetail usage «Servicio»** — `entityType="service"` + `row.serviceId` (ya no se usaba operación como destino del label de servicio).

---

## Unificación de acceso

- `FeatureRouteGuard` deja de duplicar reglas ad-hoc: llama `evaluateEntityLinkAccess` con contexto del provider o queries locales.
- `entity-route-access.ts` solo deriva manage variants desde el canónico.
- Tests: `evaluate-entity-link-access.test.ts`, registry/DTO/semantic invariants.

---

## Archivos frontend integrados (EntityLink consumers)

| Área | Archivos |
|------|----------|
| Attendance | `AttendanceListPage.tsx`, `AttendanceDetailPage.tsx` |
| Absences | `AbsencesListPage.tsx`, `AbsenceDetailPage.tsx` |
| Payroll | `PayrollReceiptsListPage.tsx`, `PayrollReceiptDetailPage.tsx` |
| Operations | `OperationsListPage.tsx`, `OperationDetailPage.tsx`, `OperationEmployeeTable.tsx`, `OperationWorkdayDetailModal.tsx` |
| Work teams | `WorkTeamDetailPage.tsx` |
| Statistics | `StatisticsEmployeeTable.tsx`, `StatisticsLocationTable.tsx`, `StatisticsOperationTable.tsx` |
| Employees | `EmployeeDeactivationDialog.tsx` |
| Home | `HomePage.tsx` |
| Platform | `WhatsappConversationDetailPage.tsx` |
| Infra | `entity-link/*`, `navigable-entity-definitions.ts`, `entity-route-access.ts`, `FeatureRouteGuard.tsx`, `AppRoutes.tsx` |

---

## Fuera de alcance (honest residuals)

| Ítem | Clasificación | Nota |
|------|---------------|------|
| Company users / platform companies / categories / reviewerName | `BLOCKED_MISSING_ROUTE` | Requiere producto + rutas nuevas |
| Chart clicks `StatisticsGeneralTab` | `NOT_APPLICABLE` | Deep-links intencionales |
| Pickers / self row-click / menús «Ver X» / CSV / dialog copy | `NOT_APPLICABLE` | Por diseño |
| `AttendanceWorkdayDetailRow` sin employeeId/serviceId | `NOT_APPLICABLE` hoy | Follow-up opcional si aparece UI |

Ninguno de estos invalida el estado **`COMPLETE`**: el alcance P0/P1 de EntityLink + contratos UI-críticos está cerrado.

---

## Riesgos conocidos (menores)

- CSS modules en tests se mockean; estilos reales se validan en build/browser.
- Enlaces en filas clickeables requieren `stopPropagation` explícito (documentado en matriz).
- WhatsApp detail enlaza `employeeId` con permisos **tenant**; en contexto platform-only puede renderizar texto si no hay sesión/módulos de empresa — comportamiento fail-closed esperado.
