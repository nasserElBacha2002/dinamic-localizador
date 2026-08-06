# Implementation corrections — validation

**Fecha:** 2026-08-06  
**Estado final:** `COMPLETE`  
**Alcance:** Corrección estructural EntityLink (auditoría exhaustiva, semántica, DTOs, acceso canónico, perf, CSS, tests)

Docs:
- `audit/entity-navigation-audit.md`
- `audit/entity-navigation-implementation-report.md`
- `audit/entity-navigation-validation.md`

---

## Lint

| Ámbito | Comando | Exit | Notas |
|--------|---------|------|-------|
| Frontend | `npm run lint` | 0 | 0 errors; 8 warnings preexistentes |
| Backend | `npm run lint` | ≠0 | 63 errors **preexistentes**; fuera de alcance EntityLink |

## Typecheck / build

| Ámbito | Comando | Exit |
|--------|---------|------|
| Frontend | `npm run build` (`tsc -b && vite build`) | 0 |
| Backend | `npm run build` | 0 |

## Tests frontend

| Suite | Exit | Resultado |
|-------|------|-----------|
| `src/components/entity-link/*` + OperationsList responsive | 0 | 31 pass / 0 fail |

## Tests backend

| Suite | Exit | Resultado |
|-------|------|-----------|
| `employee-deactivation-impact.test.ts` | 0 | 9 pass |
| `npm test` (unit suite) | 0 | pass |

## Totales auditoría

- Total detectadas: **76**
- Convertidas: **49**
- No aplican: **22**
- Bloqueadas por ID: **0**
- Bloqueadas por ruta: **5**
- Pendientes: **0**

## Decisiones arquitectónicas

1. `NAVIGABLE_ENTITY_DEFINITIONS` único canónico → registry + `entity-route-access` + FeatureRouteGuard.
2. `evaluateEntityLinkAccess` puro; FeatureRouteGuard y EntityLink lo reutilizan.
3. `EntityLinkAccessProvider` en `ProtectedLayout` evita N suscripciones React Query por celda.
4. Default `stopPropagation=false`; opt-in en tablas con `onRowClick`.
5. Plain `<span>` estable sin rol de link cuando no hay navegación.
6. DTOs enriquecidos sin migraciones (relaciones ya existentes).

## Contratos modificados

- `AttendanceByOperationRow.serviceId`
- `WorkTeamUsageRecord.serviceId`
- `DeactivationImpactAssignment.workTeamId` / snapshot backend

## Confirmación semántica

**No** hay label de una entidad con destino de otra (AbsenceDetail + WorkTeamDetail corregidos; tests de invariante fuente).

## Warnings / skips / limitaciones

- Backend lint preexistente no limpio.
- Charts / lookups / botones de menú redundantes clasificados `NOT_APPLICABLE` (no EntityLink de texto).
- Entidades sin detalle (usuarios empresa, categorías, empresas plataforma): `BLOCKED_MISSING_ROUTE`.
