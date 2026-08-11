# Validación — Navegación genérica entre entidades

**Fecha:** 2026-08-06  
**Estado final:** `COMPLETE`  
**Auditoría:** `audit/entity-navigation-audit.md`  
**Informe:** `audit/entity-navigation-implementation-report.md`

---

## 1. Criterios de aceptación

| # | Criterio | Estado |
|---|----------|--------|
| A1 | `NAVIGABLE_ENTITY_DEFINITIONS` canónico | PASS |
| A2 | `evaluateEntityLinkAccess` puro + compartido con FeatureRouteGuard | PASS |
| A3 | `EntityLinkAccessProvider` en shell protegido | PASS |
| A4 | Matriz NAV sin PENDING; 0 BLOCKED_MISSING_ID UI-crítico | PASS |
| A5 | AbsenceDetail / WorkTeamDetail semánticamente correctos | PASS |
| A6 | DTOs con serviceId / workTeamId | PASS |
| A7 | Lint FE 0 errors; build FE/BE; tests entity-link | PASS |

---

## 2. Resultados de comandos

### Frontend lint
- Comando: `cd frontend && npm run lint`
- Exit: `0`
- Errores: `0` (8 warnings preexistentes no relacionados)

### Frontend typecheck / build
- Comando: `cd frontend && npm run build` (`tsc -b && vite build`)
- Exit: `0`

### Frontend entity-link + OperationsList tests
- Comando: `npx tsx ... --test src/components/entity-link/*.test.ts src/components/entity-link/*.test.tsx src/pages/operations/OperationsListPage.responsive.test.tsx`
- Exit: `0`
- Tests: **31 pass / 0 fail**

### Backend build
- Comando: `cd backend && npm run build`
- Exit: `0`

### Backend deactivation impact tests
- Comando: `npx tsx --test src/utils/employee-deactivation-impact.test.ts`
- Exit: `0`
- Tests: **9 pass / 0 fail**

### Backend lint
- Comando: `cd backend && npm run lint`
- Exit: no cero — **63 errores preexistentes** (no introducidos por este cambio; p.ej. `operational-domain.ts`, payroll regex). No bloquean build/tests del alcance.

### Backend unit suite
- Comando: `cd backend && npm test`
- Exit: `0`

---

## 3. Totales de auditoría

| Métrica | Valor |
|---------|-------|
| Total detectadas | 76 |
| Convertidas | 49 |
| No aplican | 22 |
| Bloqueadas por ID | 0 |
| Bloqueadas por ruta | 5 |
| Pendientes | **0** |

---

## 4. Confirmaciones

- Sin enlaces semánticamente incorrectos (serviceName → operationId).
- `stopPropagation` default `false`; opt-in en filas clickeables.
- Plain `<span>` cuando no hay navegación.
- CSS sin selectores `:global([class*="..."])`.
- Contratos: `AttendanceByOperationRow.serviceId`, `WorkTeamUsageRecord.serviceId`, deactivation `workTeamId`.

## 5. Validación manual

- Revalidar en UI: desactivar empresa (fix lifecycle previo), AbsenceDetail ops afectadas, WorkTeam usage, Home card service link, stats por operación servicio.

---

**Estado:** `COMPLETE`
