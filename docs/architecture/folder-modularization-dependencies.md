# Dependencias relevantes para la modularización

Medido sobre imports relativos de producción en `backend/src` (2752 imports internos resueltos; 0 sin resolver). No hay `paths` en `backend/tsconfig.json` ni en `frontend/tsconfig.app.json`. Un movimiento de carpeta es un cambio de ruta relativa, no un cambio de alias.

## Capas

La dirección que hay que seguir conservando:

```text
routes → middleware
routes → controllers → services → repositories → database
services → utils | types | constants | config | domain
repositories → utils | types | constants | database
```

`repositories → services` no aparece como arista de capa. Por eso un helper usado por un repositorio no puede mudarse a `services/<dominio>/`.

`controllers → services` suma 60 imports. Los controllers no conocen repositorios en el flujo normal (hay excepciones puntuales, por ejemplo `absence-request.controller.ts` importa `absenceOperationalImpactRepository`). Esta auditoría no "corrige" esas excepciones: moverlas sería un cambio de comportamiento.

## Dirección entre dominios

Conteo de imports **service → service** de producción entre grupos. Sirve para decidir qué carpetas pueden verse.

| Desde | Hacia | Imports | Lectura |
|---|---|---:|---|
| whatsapp | bot | 28 | Dirección correcta. Router y orquestador usan parsers, menús y copy de `services/bot`. |
| bot (simulador) | whatsapp | 4 | `bot-simulator.service.ts` importa `whatsapp-bot` y `whatsapp-company-context`. El canal no importa al simulador. Al mover el simulador dentro de `bot/`, la arista queda `bot → whatsapp` y es solo el simulador. |
| operations | workdays | 8 | `operation.service.ts` y la asignación llaman a la materialización y al sync de jornadas. |
| workdays | operations | 1 | Dependencia chica en sentido inverso. Las carpetas son hermanas; pueden importarse. |
| absence | operations | 3 | `absence-operational-conflict.service.ts` llama a `operationAssignmentService` y al core. |
| operations | absence | 1 | `operation.service.ts` lee `absenceOperationalImpactQueryService`. También importa el repositorio de impacto. |
| attendance | whatsapp | 4 | El recordatorio usa `twilio-outbound` y el trace. Puerto de envío, no fusión de dominios. |
| payroll | whatsapp | 4 | Notificación de recibo usa el mismo puerto de envío. |
| admin-alerts | whatsapp | 2 | Delivery de alertas usa el mismo puerto. |
| companies | workdays | 4 | `company.service.ts` dispara materialización y sync. Lifecycle de compañía, no un ciclo de jornada. |
| companies | absence | 3 | Settings y alta de compañía tocan el calendario de ausencias. |

No se encontró un ciclo de archivos en el que `whatsapp-bot.service.ts` y `bot-simulator.service.ts` se importen mutuamente. El simulador depende del canal.

### Ausencias y operaciones

No es un ciclo del mismo par de archivos:

- Lectura: `operation.service.ts` → `absence-operational-impact-query.service.ts`. El query no importa `operation.service.ts`.
- Escritura: `absence-operational-conflict.service.ts` → `operation-assignment.service.ts`. La asignación no importa el servicio de conflicto.

Dirección a conservar después de crear las carpetas:

- Operaciones puede consultar impacto de ausencias.
- Ausencias puede aplicar un conflicto llamando a la asignación.
- No agregar un puerto, una interfaz o un evento solo para que el diagrama quede en un sentido. Hoy no hay una tercera abstracción y no hace falta para mover archivos.

### Compañías y el `import()` dinámico

`platform-company.service.ts` hace `await import("./absence-calendar.service")` dentro del flujo de alta. Es un corte de ciclo entre el agregado de compañía y el calendario de ausencias. Al mover ambos, el specifier cambia a la ruta nueva y **sigue siendo dinámico**. Pasarlo a import estático en la misma PR puede reintroducir el ciclo de inicialización que ese `import()` evita.

`company-location-zone-defaults.service.ts` hace `await import("./location-zone-geocoding.service")` en un `setImmediate` post-commit. Mismo criterio: actualizar la ruta, conservar el import dinámico. Esos dos archivos no caen en la misma carpeta (`companies/` y `locations/`).

Hay más `await import()` en tests de integración y en `backend/src/test-helpers/mock-admin-alert-side-effects.ts`. Apuntan a paths de servicios y repositorios. Cada fase tiene que incluirlos en el codemod o revisarlos a mano.

## WhatsApp y bot, frontera

Imports reales desde el canal hacia el motor:

- `whatsapp-bot.service.ts` importa flows de check-in y checkout, `bot-outbound-response` y el router.
- `whatsapp-router/*.handler.ts` importa `bot-response.builder`, `bot-menu.builder`, `bot-intent.parser` y `bot-session.service`.
- `whatsapp-turn-routing.resolver.ts` importa el parser de intents y el builder de menú.

Imports que no deben invertirse al crear carpetas:

- Los flows de `bot/` no deben pasar a importar cuota, costo, observabilidad ni `twilio-outbound`.
- `employee-workday.service.ts` importa `INVALID_SELECTION_MESSAGE` desde `bot/bot-response.builder`. Es copy de UI de bot dentro del agregado de jornada. Se deja; sacarlo es un cambio de copy/comportamiento, no un movimiento de carpeta. Después del move la ruta será `services/workdays/` → `services/bot/`.

`attendance-reminder.service.ts` importa `bot-session.service.ts`. Asistencia depende de la sesión del bot. Permitido. No es motivo para meter el recordatorio dentro de `bot/` ni de `whatsapp/`.

## Utils compartidos de verdad

Estos se quedan en `utils/` raíz aunque un prefijo sugiera dominio:

| Archivo | Evidencia |
|---|---|
| `row-mappers.ts` | Lo importan del orden de 29 repositorios y algunos services. 563 líneas. Partirlo es otro proyecto. |
| `sql-server-errors.ts` | Repositorios y services, más imports. |
| `pagination.ts` | Repositorios y services. |
| `absence-date.ts` | Lo usan services de varios dominios, repositorios y otros utils. El nombre es de ausencias; el uso es de fechas de compañía. |
| `operation-timezone.ts` | 22 services y también un repositorio. Sí se mueve a `utils/operations/` porque el dominio es operaciones; otros dominios pueden importar `utils/operations/operation-timezone`. |
| `bot-runtime-context.ts` | 23 services. Va a `utils/bot/`, no a `utils/whatsapp/`. |

`repositories` y `services` importan los mismos utils de dominio (28 archivos en la intersección). Eso es compatible con `utils/<dominio>/`. Es incompatible con meter esos archivos en `services/`.

## Acoplamiento a paths que el move tiene que tocar

Barrrels:

- `backend/src/routes/index.ts` monta cada router. No se mueve. Si una fase no toca routes, este archivo no cambia.
- `backend/src/services/attachment-storage/index.ts` lo importan los servicios de attachment, payroll y company. Se muda con el provider a `services/attachments/storage/index.ts`. Quien importe el barrel actualiza una sola ruta.
- Frontend: `design-system/index.ts`, `design-system/components/index.ts`, `design-system/filters/index.ts`, `design-system/forms/index.ts`, `components/entity-link/index.ts`. Fuera de alcance.

Tests que leen el fuente por path literal (hay que cambiar la string en la misma PR):

- `services/phase3-4-sql-performance.source-structure.guard.test.ts` (`whatsapp-message-cost-reconcile.service.ts`, `attendance-reminder.service.ts`)
- `services/daily-attendance-report-phase1.regression.source.test.ts`
- `services/whatsapp-checkin-during-absence.source-structure.guard.test.ts` (`services/bot/check-in-attendance.flow.ts`; este path no cambia si el flow se queda en `bot/`)
- `services/absence-phase5-closure.source-structure.guard.test.ts`
- `repositories/attendance-notification.repository.source.test.ts`
- `routes/twilio-signature-separation.source.test.ts` (routes no se mueven)

No hay referencias a `src/services/<archivo>` en `.github/`. El build de TypeScript excluye `src/**/*.test.ts`, así que un path de test roto no falla en `tsc`.

## Frontend

No hay ciclo de carpetas que esta propuesta cierre o abra: no se mueven `hooks/` ni `api/` de capa. El único move recomendado es interno a `pages/settings/components/`. Esos diálogos los importa la página de settings.

`components/operations` importa hooks de operaciones, equipos y recomendación. Las subcarpetas opcionales (`ai/`, `shifts/`, `assignment/`) solo alargan el relativo; no cambian el sentido de la dependencia.

## Riesgo de regresión por dependencia

| Riesgo | Dónde | Qué hacer en la PR |
|---|---|---|
| `import()` olvidado | Alta de compañía, backfill de geocoding, mocks de alertas | Buscar `await import(` en el diff y en los archivos movidos. |
| Ciclo nuevo | Meter `bot-session` bajo `whatsapp/` | No hacerlo. Sesión va a `bot/`. |
| Inversión de capa | Mover utils a services | No hacerlo. |
| Guard de path | Tests `source-structure` y `source.test` | Actualizar la ruta literal. |
| Import de copy de bot desde jornadas | `employee-workday.service.ts` | Solo reescribir el relativo. |
