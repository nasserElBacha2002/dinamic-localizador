# Plan de refactor por fases

Cada fase es un PR mergeable solo. No hay un PR que mueva las 669 rutas. El mapa filtrable está en `folder-modularization-move-map.csv` (columna `phase`).

Regla común a todas las fases de backend:

- Se mueve el archivo y su test colocado. No se renombra. No se edita lógica.
- Se reescriben imports relativos, incluidos `await import("...")`.
- Se actualizan strings de path en tests `*.source-structure.guard.test.ts` y `*.source.test.ts` que apunten al archivo movido.
- No se agregan `index.ts`.
- `tsc -p backend/tsconfig.json` no compila tests. La aceptación incluye la suite que cubre el área (`npm test` en `backend/`, o el subconjunto que el runner permita si existe filtro; el script real es `node ./scripts/run-unit-tests.mjs`).
- Criterio de diff: solo paths. Si el diff toca un cuerpo de función, la PR se parte.

Orden: services de un dominio, después el espejo de repositories de ese dominio, después los utils de ese dominio. Así cada path se reescribe una vez por archivo. Las fases 5 y 6 están numeradas globales, pero se ejecutan **por dominio** recién cuando la fase de services de ese dominio ya está en main.

## Fase 1 — Canal WhatsApp y cierre de `bot/`

**Alcance.** 36 archivos de producción y 33 tests. Entra `services/whatsapp/` con el router dentro (`whatsapp/router/`). Sesión, runtime, simulador y retry contextual entran a `services/bot/`, que ya existe. No se mueve el flow de check-in ni el de checkout.

**Por qué primero.** Es el módulo implícito más grande y el único que ya está partido a medias. Cierra la frontera `whatsapp → bot` sin anidar el motor dentro del canal.

**Imports.** Todo lo que hoy importa `./whatsapp-*.service`, `./twilio-outbound.service`, `./bot-session.service`, `./whatsapp-router/...`. Incluye `attendance-reminder.service.ts` (sigue en la raíz en esta fase) y handlers del router.

**Tests.** Unitarios e integración de WhatsApp, bot, recordatorios que mockean sesión, y `whatsapp-checkin-during-absence.source-structure.guard.test.ts` solo si algún path literal cambia. El flow de check-in no se mueve.

**Riesgos.** `whatsapp-bot.service.ts` (830 líneas) es la fachada. Un import relativo mal subido deja `undefined` en runtime por ciclo. El simulador, ya dentro de `bot/`, importa el orquestador en `whatsapp/`: relativo `../whatsapp/whatsapp-bot.service`. Permitido.

**Aceptación.** Los archivos `whatsapp-*` y `twilio-*` de producción ya no están en la raíz de `services/`, salvo que el mapa los excluya. `bot-session.service.ts` está en `services/bot/`. Tests de WhatsApp y bot en verde. Sin `index.ts` nuevo.

## Fase 2 — Ausencias

**Alcance.** 17 producción y 17 tests hacia `services/absence/`.

**Imports.** `operation.service.ts` sigue en la raíz e importa `../absence/absence-operational-impact-query.service`. `absence-operational-conflict` importa asignación, que sigue en la raíz (`../operation-assignment.service`). Esas dos aristas se conservan.

**Tests.** Integración de ausencia (concurrencia, ledger, calendario, conflicto operacional) y `absence-phase5-closure.source-structure.guard.test.ts`.

**Riesgos.** Alto por leases, fencing y webhooks de ausencia. El movimiento no toca SQL.

**Aceptación.** Ningún `absence-*.service.ts` de producción queda en la raíz. Los imports cruzados con operaciones siguen existiendo y apuntan al path nuevo.

## Fase 3a — Operaciones

**Alcance.** 16 producción y 25 tests hacia `services/operations/`: operación, asignación, turnos, import, lifecycle, horarios one-time y recurring schedule. No incluye materialización de jornadas (fase 3b) ni `service.service.ts` (fase 4b, ubicaciones).

**Imports.** `operation.service.ts` sigue llamando a materialización (`../recurring-workday-materialization.service` mientras 3b no esté) y al query de ausencias (`../absence/...` si la fase 2 ya se mergeó).

**Tests.** Multi-turno que cubren operación, reasignación, import, lifecycle. Guards de path que citen `operation.service.ts` o `operation-assignment.service.ts`.

**Riesgos.** Es el orquestador más conectado (`operation.service.ts`, 1088 líneas; `operation-assignment.service.ts`, 1189). Solo paths.

**Aceptación.** Esos servicios viven en `services/operations/`. La materialización sigue donde estaba al empezar la fase.

## Fase 3b — Jornadas

**Alcance.** 9 producción y 15 tests hacia `services/workdays/`. `employee-workday-attendance.command.ts` no entra: va a attendance en la fase 4j porque escribe el repositorio de asistencia.

**Imports.** Operaciones (ya en `services/operations/` si 3a está mergeada) apuntan a `../workdays/recurring-workday-materialization.service`. `employee-workday.service.ts` sigue importando el copy de `bot/bot-response.builder`; solo cambia el relativo.

**Tests.** Materialización, sync, multi-shift de jornada.

**Riesgos.** Tests de concurrencia de materialización. Dependencia hermana con operaciones, documentada como permitida.

**Aceptación.** `recurring-workday-*` y `employee-workday.service.ts` están en `services/workdays/`. El command de asistencia no se movió en esta fase.

## Fase 4 — Resto de services, un dominio por PR

Cada letra es un PR. Se puede mergear en cualquier orden respecto de las otras letras. Conviene hacerlas después de 1–3 para no reescribir dos veces los imports cruzados, pero no es bloqueante si el dominio casi no importa a los anteriores.

| PR | Producción | Destino |
|---|---:|---|
| 4a | 16 | `services/companies/` |
| 4b | 5 | `services/locations/` (`service.service.ts`, zonas, geocoding, geofence, geolocation) |
| 4c | 13 | `services/attachments/` y `attachments/storage/` (hoy `attachment-storage/`) |
| 4d | 5 | `services/payroll/` |
| 4e | 8 | `services/reports/` (diario y mensual) |
| 4f | 10 | `services/admin-alerts/` |
| 4g | 6 | `services/identity/` |
| 4h | 7 | `services/employees/` |
| 4i | 2 | `services/work-teams/` |
| 4j | 5 | `services/attendance/` incluido `employee-workday-attendance.command.ts` |
| 4k | 2 | entran a `services/recommendation/` ya existente |

**4a es la más delicada de este bloque.** `platform-company.service.ts` conserva `await import(...)` hacia el calendario de ausencias, con la ruta nueva. `company.service.ts` sigue orquestando jornadas, settings y alertas; no se parte.

**4b.** `company-location-zone-defaults.service.ts` queda en companies (prefijo `company-`) y conserva el `import()` dinámico hacia `location-zone-geocoding.service.ts`, que sí va a `locations/`.

**4c.** Actualizar el barrel `attachment-storage/index.ts` y sus importadores (attachment, payroll, company).

**4i** son solo dos servicios. La carpeta existe para que la raíz de `services/` no vuelva a mezclar dominios. No se crean subcarpetas adentro.

**Raíz que debe quedar** al terminar la fase 4: `audit`, `client`, `email`, `lookup`, `rate-limit-store`, `rate-limit-cleanup`, `replacement-request`, `server-status`, `statistics`, `system-logs`, más los tests de infraestructura que el mapa no clasifica (aislamiento de tenant, integridad de base, locks).

**Aceptación de cada letra.** El dominio indicado ya no tiene archivos de producción en la raíz de `services/`. Tests de ese dominio en verde. Los `import()` dinámicos de 4a y 4b siguen siendo dinámicos.

## Fase 5 — Repositories, un dominio por PR

Columna `phase` con forma `5-<dominio>`. Solo después del service de ese dominio. Producción a mover, aproximadamente:

| PR | Producción |
|---|---:|
| 5-whatsapp | 19 |
| 5-operations | 15 |
| 5-companies | 14 |
| 5-absence | 9 |
| 5-employees, 5-identity, 5-reports | 5 cada uno |
| 5-admin-alerts, 5-attendance | 4 cada uno |
| 5-payroll | 3 |
| 5-locations, 5-work-teams, 5-workdays | 2 cada uno |

No se mueven `client.repository.ts`, el repositorio de recomendación ni los de audit/system: serían carpetas de un archivo mientras el service sigue en la raíz o ya tiene otro hogar.

`operation-workday.repository.ts` va con operaciones. `employee-workday.repository.ts` va con jornadas.

**Imports.** Sobre todo `services/<dominio>/` → `../../repositories/<dominio>/...`, y tests de integración.

**Riesgos.** `attendance.repository.ts` (1422) y `employee-workday.repository.ts` (1316) se mueven enteros. No se parten.

**Aceptación.** El service del dominio y su repositorio están en carpetas del mismo nombre. `repositories/` raíz conserva los que el mapa excluye.

## Fase 6 — Utils de dominio

Un PR por carpeta destino (`6-absence`, `6-attendance`, `6-operations`, `6-whatsapp`, `6-bot`, …). El helper baja a `utils/<dominio>/`, nunca a `services/`.

No se crean carpetas nuevas cuando ya hay una:

- política de canal de alerta → `utils/admin-alert/`
- intent de recibo → `utils/payroll-receipts/`
- resumen de geocoding → `utils/geocoding/`
- metadata de mensaje de ubicación Twilio → `utils/whatsapp/`

`absence-date.ts`, `row-mappers.ts`, `sql-*`, `pagination.ts`, `phone.ts` y el resto del kernel listado en la auditoría no entran en el mapa.

`utils/absence-attachments/`, `utils/service-fix/` y `utils/service-reconciliation/` no se fusionan ni se renombran en esta fase.

**Imports.** Services y repositories. Es la fase con más call sites por archivo, porque utils se importa desde las dos capas.

**Riesgos.** Un util movido al dominio equivocado obliga a que otro dominio importe una carpeta que no le corresponde. Si en el PR aparece un import desde tres dominios distintos hacia un archivo recién movido, se devuelve a la raíz y se anota en la auditoría. `operation-timezone.ts` es la excepción conocida: vive en `utils/operations/` y otros dominios pueden importarlo.

**Aceptación.** El archivo y su `*.test.ts` hermano están en el destino del mapa. Tests de ese helper en verde. `repositories/` no gana ningún import hacia `services/`.

## Fase 7 — Settings del frontend, y operaciones solo si se quiere

**Recomendado.** 21 componentes de `frontend/src/pages/settings/components/` hacia subcarpetas `absence`, `locations`, `whatsapp`, `schedule`, `reports`, `employees`. El shell del diálogo se queda.

**Imports.** Locales a settings. No hay alias.

**Tests.** `company-settings-page` y los tests de diálogos que importen esos componentes.

**Aceptación.** La página de settings abre cada diálogo (ausencias, zonas, WhatsApp, horarios, categorías, reporte diario) sin error de import. Verificación de UI: la página de configuración de compañía, no solo el typecheck.

**Opcional, PR aparte, `status=optional` en el CSV.** 16 archivos de `components/operations` hacia `ai/`, `shifts/` y `assignment/`. Se puede no hacer. La ficha de operación ya es un feature.

Esta fase no mueve `hooks/`, `api/` ni `types/`.

## Fase 8 — Limpieza y límite para que no vuelva a crecer

**Alcance.** Sin movimientos de dominio.

- Borrar `backend/src/utils/operation-assignment-notification/` si sigue vacía.
- Borrar subcarpetas vacías de `website/src/sections/` (`hero`, `narrative`, `product-experience`) solo si no las usa el build.
- Anotar en `backend/AGENTS.md` la convención de la auditoría: el servicio nuevo de un dominio con carpeta nace en esa carpeta; no se agrega `index.ts` de dominio; utils de dominio no entran a `services/`.
- Un check liviano, si se quiere enforcement automático: la raíz de `backend/src/services/` solo puede contener la lista de infraestructura más tests de infraestructura. El check lee nombres, no reescribe imports.

**Aceptación.** La raíz de `services/` coincide con la lista de la fase 4. El documento de convención está en el AGENTS del backend y no duplica esta auditoría entera.

## Qué queda fuera a propósito

- Vertical slices (`attendance/controller+service+repository`).
- `features/` en el frontend.
- Partir migraciones, design system, controllers, routes, schemas, types, constants, jobs o middleware.
- Partir `attendance.repository.ts`, `row-mappers.ts`, `whatsapp-bot.service.ts` o `checkout-attendance.flow.ts`. Eso son refactors de archivo, con tests de comportamiento, y cada uno sería su propio PR después de que el archivo ya esté en la carpeta definitiva.
