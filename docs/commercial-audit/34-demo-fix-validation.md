# 34 — Validación de los fixes de la demo

Entorno: local (SQL Server del `docker-compose`, backend en 3004, frontend `vite preview` en 8084), 2026-10-25. Sin cambios en producción, `.env`, migraciones ni dependencias. Sin commit.

## B-01 — Reemplazo falla en operaciones ONE_TIME

**Estado: FIXED**

**Causa.** `replacementRequestService.materializeCandidates` le pasaba siempre `context.workDate` al recomendador como `effectiveDate`. Ese valor era un `Date` de mssql convertido con `String()` ("Sat Oct 24 2026 21:00…"). El recomendador rechaza `effectiveDate` en ONE_TIME (`EFFECTIVE_DATE_NOT_APPLICABLE`) y en RECURRING recibía un formato inválido. El mismo `String()` afectaba `validFrom`/`validUntil` y el texto de respuesta en `handleQuickReply`.

**Archivos.**
- `backend/src/services/replacement-request.service.ts`
- `backend/src/services/replacement-request.integration.test.ts` (nuevo)

**Diff (resumen).**
- `requestContextSql` también selecciona `o.operation_kind`; `ReplacementContext` suma `operationKind`.
- `toContext` y `handleQuickReply` normalizan `work_date` con `toDateOnlyString` (`YYYY-MM-DD`).
- `materializeCandidates` envía `effectiveDate` solo si `operationKind === "RECURRING"`.

**Tests (ejecutados, SQL Server real, empresa seed "Dinamic Systems").**
- ONE_TIME: el recomendador recibe `effectiveDate === undefined`, la solicitud queda PENDING con candidatos y el ausente no figura entre ellos.
- RECURRING: el recomendador recibe la fecha `YYYY-MM-DD` de la jornada.
- Idempotencia: un segundo aviso para la misma jornada reutiliza la única solicitud y no duplica candidatos.
- Resultado: 3/3 pasan. Con el servicio sin el fix, los 3 fallan con `EFFECTIVE_DATE_NOT_APPLICABLE`.

**Resultado real en la demo.**
- Diego Molina repitió "No voy" por el webhook local para Torre Corporativa (ONE_TIME, 19:00–23:00). El bot respondió: "Entendido. Registramos que no estás disponible para: Torre Corporativa — Microcentro … 25/10/2026 — 19:00".
- Se creó la solicitud `30C486D1-…` (PENDING) con 3 candidatos: Sofía Romero, Camila Duarte y Elena Vargas, todos con score 0 porque el tenant no tiene historial.
- Se encoló 1 notificación `REPLACEMENT_REQUEST` para Valeria. **No se envió**: sin Twilio y con el worker de alertas apagado.
- La cobertura se resolvió desde la web ("Cubrir / reemplazar"): Sofía cubre a Diego con origen COVERAGE. Esa acción no cierra la solicitud de WhatsApp, que sigue PENDING. La elección por WhatsApp no se pudo validar.

**Hallazgo no corregido.** En `handleQuickReply`, la hora del mensaje "reemplazo cubierto" se arma con `toISOString().slice(11, 16)`, que es hora UTC. No se ejercitó (requiere Twilio) y queda documentado.

## B-02 — Filtro `confirmationStatus` ignorado

**Estado: FIXED**

**Causa.** `statistics.schema.ts` validaba `confirmationStatus`, pero `buildEmployeeWorkdayStatisticsFilters` nunca lo aplicaba. Además, el aviso "No voy" con jornada materializada escribe `employee_workdays.unavailable_at` y deja `operation_assignments.confirmation_status` en PENDING. Las vistas leían solo la columna de la asignación.

**Archivos.**
- `backend/src/utils/employee-workday-statistics-projection.ts`: nuevo `CONFIRMATION_STATUS_SQL` (la indisponibilidad de la jornada prevalece) y filtro por `@workdayConfirmationStatus`.
- `backend/src/repositories/operation-attendance.repository.ts`: resumen y filas de la operación usan `CONFIRMATION_STATUS_SQL`.
- `backend/src/services/daily-attendance-report-aggregator.service.ts`: el reporte diario usa la misma expresión.
- Tests:
  - `employee-workday-statistics-projection.test.ts` (unitario);
  - `operation-attendance-summary.integration.test.ts` (nuevo caso).

**Regresión detectada y corregida en esta pasada.** La primera versión del filtro declaraba `@confirmationStatus`. Los repositorios de incidencias (`operational-incident-details` y `operational-incident-summary`) ya declaran ese nombre en el mismo request, y `statistics/attendance/incident-details?confirmationStatus=…` respondía 500 ("parameter name confirmationStatus has already been declared"). El parámetro se renombró a `@workdayConfirmationStatus` y el unitario verifica que no colisione.

**Tests (ejecutados).**
- Unitario: cada estado liga solo `workdayConfirmationStatus`, sin filtro no se agrega cláusula y el SQL prioriza `ew.unavailable_at`.
- Integración: una jornada con `unavailable_at` y asignación PENDING se reporta como UNAVAILABLE en el resumen de la operación.

**Resultado real (API del tenant demo, sesión de Valeria).**

| Filtro | `workday-details` |
|---|---|
| Sin filtro | 12 |
| UNAVAILABLE | 1 (Diego) |
| CONFIRMED | 1 (Pablo) |
| PENDING | 10 |

- La suma de los tres estados coincide con el total.
- Los siete endpoints de estadísticas probados (`summary`, `status-distribution`, `by-employee`, `by-operation`, `by-service`, `workday-details`, `incident-details`) responden 200 con cada valor del filtro y sin él.
- Antes del corrimiento de fechas del reporte, la misma consulta daba 9 / 1 / 1 / 7.
- El inicio muestra "Avisó que no asistiría = 1" (SS-01) y la operación muestra a Diego "No disponible".

**Límite.** En `incident-details`, las incidencias de cobertura y cambios no se filtran por confirmación (comportamiento previo, sin cambios). El reporte mensual sigue leyendo `oa.confirmation_status`; no se tocó.

## Fix adicional — Fecha operativa en Estadísticas › Incidencias

**Estado: FIXED**

- **Causa:** `operational-incident-details.repository.ts` mapeaba `String(row.operational_date).slice(0, 10)`; con un `Date` de mssql eso daba "Sat Oct 24" (día anterior, en inglés). Es el mismo patrón que B-01.
- **Cambio:** `toDateOnlyString(row.operational_date)`, que ya tiene tests en `row-mappers.assignment.test.ts`. El repositorio no tiene un test propio.
- **Resultado real:** antes del fix la columna mostraba "Sat Oct 24" (`SS-18B-evidencia-fecha-bug.png`); después, `2026-10-25` (`SS-18.png`).

## Otros cambios locales

- `admin-alert-migration.integration.test.ts`: el restore final de `CK_waan_alert_type` incluye `REPLACEMENT_REQUEST`. Sin ese valor, el test dejaba la base local sin el tipo y "No voy" fallaba con "No se pudo determinar la empresa".
  - Se reaplicó localmente el DDL exacto de las migraciones 150 y 103.
  - El test #7 ("upgrade-safe 103") sigue fallando en bases que ya tienen tipos de alerta más nuevos, y borra los constraints. Es un problema previo: no correrlo contra la base demo.
- Sin cambios en el frontend.

## Git

```
 ...peration-attendance-summary.integration.test.ts | 88 ++++++++++++++++++++++
 .../operation-attendance.repository.ts             | 11 +--
 .../operational-incident-details.repository.ts     |  3 +-
 .../admin-alert-migration.integration.test.ts      |  3 +-
 .../daily-attendance-report-aggregator.service.ts  | 12 ++-
 .../src/services/replacement-request.service.ts    | 15 ++--
 .../employee-workday-statistics-projection.test.ts | 44 ++++++++++-
 .../employee-workday-statistics-projection.ts      | 17 +++++
 8 files changed, 177 insertions(+), 16 deletions(-)
```

Archivo nuevo sin versionar: `backend/src/services/replacement-request.integration.test.ts`.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `tsc -p tsconfig.json --noEmit` (backend) | OK |
| `eslint` sobre los 9 archivos tocados | OK |
| `npm test` (backend, unitarios) | 2115/2115 |
| `replacement-request.integration.test.ts` | 3/3 |
| `operation-attendance-summary.integration.test.ts` | 3/3 |
| API de estadísticas con los 4 valores del filtro | 200 en los 7 endpoints |

**No ejecutado:** suite de integración completa (el test #7 de migración de alertas es destructivo sobre la base demo) y tests de frontend (no se tocó el frontend).

## Estado final

B-01 FIXED. B-02 FIXED, incluida la regresión de parámetros que introdujo el propio fix. Fecha de incidencias FIXED. Cambios locales sin commit.
