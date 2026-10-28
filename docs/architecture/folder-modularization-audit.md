# Auditoría de modularización de carpetas

Lectura solamente. No se movió código, no se reescribieron imports y no se crearon carpetas de producto.

La pregunta que esta auditoría responde: el problema estructural está en el backend por capas planas (`services/`, `utils/`, `repositories/`), existe porque el crecimiento de dominios se acumuló dentro de la capa técnica, y la estructura mantenible es seguir en capas con subcarpetas de dominio. Una reescritura a vertical slices o a `features/` en el frontend agregaría profundidad y ciclos sin mejorar el acoplamiento real.

## Resumen ejecutivo

Se recorrieron **166 directorios** bajo el monorepo, excluyendo `node_modules`, `dist`, `.git` y carpetas ocultas. El juicio de severidad está en 32 carpetas (las saturadas y las que solo parecen saturadas por el conteo).

| Severidad | Carpetas | Qué significa aquí |
|---|---:|---|
| P0 | 0 | No hay una carpeta cuyo layout produzca un ciclo de inicialización o un riesgo directo de defecto. |
| P1 | 4 | `backend/src/services`, `backend/src/utils`, `backend/src/repositories`, `backend/src/services/whatsapp-router` (módulo a medio extraer). |
| P2 | 6 | `services/bot` incompleto, `frontend/src/hooks`, `frontend/src/api`, `frontend/src/utils`, `pages/settings/components`, `components/operations`. |
| P3 o sin cambio | 22 | Schemas, controllers, routes, types, constants, jobs, middleware, migraciones, design system, pages y components ya agrupados. |

Carpetas con más archivos directos (código, tests incluidos):

| Carpeta | Archivos directos | Producción | Tests |
|---|---:|---:|---:|
| `backend/src/services` | 351 | 146 | 205 |
| `backend/src/utils` | 259 | 150 | 109 |
| `database/migrations` | 156 | — | señal falsa |
| `backend/src/repositories` | 126 | 97 | 29 |
| `frontend/src/utils` | 121 | 67 | 54 |
| `backend/src/schemas` | 62 | 45 | 17 |
| `frontend/src/hooks` | 58 | 49 | 9 |
| `backend/src/constants` | 53 | — | catálogo |
| `frontend/src/api` | 50 | 43 | 7 |
| `backend/src/routes` | 47 | 33 | 14 |

Los tests colocados al lado del fuente duplican el ruido visual. En `services/` siguen siendo **146 archivos de producción** de dominios distintos. Eso alcanza para modularizar aunque se ignoren los 205 tests.

Cajones de sastre:

- **`backend/src/services`**: capa técnica usada como depósito de todos los casos de uso. Ya empezó a partirse (`bot/`, `whatsapp-router/`, `attachment-storage/`, `recommendation/`) y el resto quedó afuera.
- **`backend/src/utils`**: mezcla kernel real (`sql-*`, `pagination`, `phone`, `row-mappers`) con helpers de un solo dominio (`attendance-list-projection.ts`, 869 líneas). Hay una carpeta vacía: `utils/operation-assignment-notification/`.
- **`frontend/src/pages/settings/components`**: 26 componentes de producto mezclan ausencia, zonas, WhatsApp, horarios, reportes y categorías.
- **`frontend/src/utils` y `frontend/src/hooks`**: parecen cajones por el conteo. La mayoría de sus archivos los importa más de una feature. No son el mismo problema.

Módulos implícitos, confirmados por nombre y por imports de producción:

- Canal WhatsApp: ~32 servicios de producción todavía en la raíz, más el router ya extraído y el motor `services/bot`.
- Ausencias: 17 servicios de producción (`absence-request`, balances, calendario, impacto operacional, adjuntos).
- Operaciones y jornadas: `operation.service.ts` importa `recurringWorkdayMaterializationService`. Es una capacidad de programación, no dos mundos aislados.
- Alertas admin, reportes de asistencia, payroll, compañías, identidad, empleados, ubicaciones operativas.

`Service` en el código de producto es la ubicación operativa (tabla `operational_locations`, término de producto "Servicio"). No es la capa `services/`. El destino de `service.service.ts` es `services/locations/`, sin renombrar el archivo. Una carpeta `services/services/` sería un error de nombres.

Archivos monolíticos (producción, 700 líneas o más): 37. Los que más importan para una partición interna, después de ubicarlos en la carpeta correcta:

| Archivo | Líneas | Qué concentra |
|---|---:|---|
| `repositories/attendance.repository.ts` | 1422 | Un objeto `attendanceRepository` y el armado de filtros. |
| `repositories/employee-workday.repository.ts` | 1316 | Mapeo y consultas del agregado de jornada. |
| `repositories/attendance-notification.repository.ts` | 1308 | Candidatos y elegibilidad de recordatorios. |
| `services/bot/checkout-attendance.flow.ts` | 1252 | Checkout con y sin llegada, con y sin ubicación. |
| `services/operation-assignment.service.ts` | 1189 | Alta, reasignación, reconciliación de jornadas. |
| `services/attendance-reminder.service.ts` | 1183 | Selección, plantilla y envío de recordatorios. |
| `services/recurring-workday-materialization.service.ts` | 1181 | Snapshots y materialización multi-turno. |
| `services/operation.service.ts` | 1088 | CRUD de operación más orquestación de jornada, ausencia y lifecycle. |
| `services/user-invitation.service.ts` | 1034 | Emisión, persistencia y mail de invitación. |
| `services/absence-request.service.ts` | 975 | Validación, solape y alta de solicitud. |
| `services/whatsapp-bot.service.ts` | 830 | Fachada del canal: cuota, clasificación, router y flows. |
| `utils/attendance-list-projection.ts` | 869 | Proyección de listado viviendo en utils global. |
| `frontend/.../AttendanceDetailPage.tsx` | 851 | Página de detalle. |
| `frontend/.../OperationForm.tsx` | 822 | Formulario de operación. |

Partir esos archivos es un refactor de comportamiento. No forma parte del mapa de movimientos de carpetas.

Dependencias circulares:

- No hay ciclo de producción entre `services/bot` y `whatsapp-bot.service.ts`. El simulador importa al canal; el canal no importa al simulador.
- Hay dependencia de dominio en los dos sentidos entre operaciones y ausencias, sin que el mismo par de archivos se importe: `operation.service.ts` lee `absenceOperationalImpactQueryService`; `absence-operational-conflict.service.ts` escribe vía `operationAssignmentService`.
- Hay `import()` dinámico a propósito para cortar ciclos: `platform-company.service.ts` → `absence-calendar.service`, y `company-location-zone-defaults.service.ts` → `location-zone-geocoding.service`. Hay que conservarlos al mover.

Alcance del mapa de movimientos: **669 archivos recomendados** (379 de producción y 290 tests) y **16 opcionales** en la UI de operaciones. Ninguna fase mueve eso junto. El detalle está en `folder-modularization-move-map.csv`.

## Cómo está armado el repositorio

Backend en capas, imports relativos, sin `paths` en `tsconfig`:

```text
routes → controllers → services → repositories → database
                services → utils, types, constants
                repositories → utils
```

Conteo de imports de producción entre capas (los más grandes):

| Desde | Hacia | Imports |
|---|---|---:|
| services | repositories | 359 |
| services | utils | 352 |
| services | services | 327 |
| services | types | 139 |
| utils | utils | 113 |
| repositories | utils | 105 |
| repositories | database | 93 |
| controllers | services | 60 |

Esa dirección es el activo a conservar. Si un helper de dominio se muda dentro de `services/<dominio>/`, los repositorios pasarían a importar servicios. Por eso el destino de los helpers es `utils/<dominio>/`.

El frontend ya agrupa por feature donde el usuario navega: `pages/absences`, `pages/operations`, `components/employees`, y así. `hooks/`, `api/`, `types/` y `utils/` siguen siendo capas. De 49 hooks de producción, 31 los usa más de una feature. De 67 utils de producción, 43 los usa más de una feature. `useAuth`, `errors.ts`, `dates.ts` y `client.ts` son infraestructura de la app.

Migrar el frontend a `features/attendance/{components,hooks,api,types}` duplicaría `pages/` y `components/`, y partiría hooks que hoy cruzan pantallas. El frontend no justifica ese cambio.

## Hallazgos por carpeta

La tabla completa, con conteos medidos, está en `folder-modularization-inventory.csv`. Aquí va el criterio de los casos que sí cambian y de los que se evaluaron para dejarlos quietos.

### `backend/src/services` — P1

Estructura actual: 351 archivos en la raíz y cuatro subcarpetas. Producción por grupo detectado en el código (tests viajan con el fuente):

| Destino | Producción | Por qué es un módulo |
|---|---:|---|
| `services/whatsapp/` | 32 | Canal: orquestador, cuota, costo, observabilidad, retención, clasificación, Twilio outbound, router. |
| `services/bot/` (completar) | 4 sueltos | Sesión, runtime, simulador y retry contextual. Los flows ya viven en `bot/`. |
| `services/absence/` | 17 | Solicitud, saldo, calendario, impacto y conflicto operacional. |
| `services/operations/` | 16 | Operación, asignación, turnos, import, lifecycle, horarios one-time. |
| `services/workdays/` | 9 | Jornada del colaborador, materialización y sync. `employee-workday-attendance.command.ts` va a attendance: escribe `attendanceRepository`. |
| `services/companies/` | 16 | Compañía, settings, usuarios, módulos, lifecycle, platform company. |
| `services/attachments/` | 13 | Servicios de aplicación más el provider ya existente. |
| Resto (payroll, reports, alerts, identity, employees, locations, attendance, work-teams, recommendation) | 2 a 10 cada uno | Misma regla: sacar el dominio de la raíz. |
| Raíz que se queda | 10 | `audit`, `email`, `lookup`, `rate-limit-*`, `client`, `statistics`, `system-logs`, `replacement-request`, `server-status`. |

`services/bot` no se anida dentro de `whatsapp/`. El canal importa parsers, menús y flows (`whatsapp-bot.service.ts` importa `check-in-attendance.flow` y `checkout-attendance.flow`). La sesión la usan también el router, los flows, `absence-bot` y `attendance-reminder`. Meter `bot-session.service.ts` bajo WhatsApp haría que asistencia y ausencias dependan de la carpeta del canal. El movimiento es al revés: sesión y simulador entran a `services/bot/`.

Reportes diarios y mensuales comparten un destino, `services/reports/`. No hace falta `reports/daily`, `reports/monthly` y `reports/delivery`: el mensual son cuatro archivos chicos al lado del diario.

### `backend/src/utils` — P1

De los helpers de producción en la raíz, el mapa mueve los que el nombre y el uso atan a un dominio. Se quedan en la raíz, entre otros: `sql-*`, `pagination.ts`, `phone.ts`, `row-mappers.ts`, `csv.ts`, `log-redaction.ts`, `safe-transaction.ts`, `password.ts`, `haversine.ts`, `normalize-optional-text.ts` y `absence-date.ts`.

`absence-date.ts` tiene nombre de ausencias y lo importan operaciones, repositorios y otros utils (`getDateIsoInTimezone`). Es una primitiva compartida con nombre de dominio. Moverla a `utils/absence/` ocultaría eso. Un renombre queda fuera de esta auditoría.

No se abren carpetas paralelas a las que ya existen:

- `admin-notification-channel-policy.ts` entra a `utils/admin-alert/`.
- `payroll-receipt-intent.ts` entra a `utils/payroll-receipts/`.
- `location-zone-geocoding-summary.ts` entra a `utils/geocoding/`.
- `location-message-metadata.ts` entra a `utils/whatsapp/`: normaliza flags `Forwarded` de Twilio, no zonas.

`utils/service-fix/` y `utils/service-reconciliation/` son herramientas de mantenimiento de la ubicación operativa. Se quedan. `utils/absence-attachments/` se queda al lado de un futuro `utils/absence/`; fusionarlas sería un segundo movimiento.

### `backend/src/repositories` — P1, después de services

97 archivos de producción, cada uno suele ser un agregado. El dolor es encontrar el par service/repository cuando la raíz de services ya no es plana. El espejo `repositories/<dominio>/` se hace **después** de que ese dominio ya vive en `services/`, y un dominio por PR.

No se crean carpetas de un solo archivo: `client.repository.ts`, `recommendation-feature.repository.ts` y los repos de audit/system se quedan en `repositories/`.

`operation-workday.repository.ts` queda en `repositories/operations/` por el prefijo y por el agregado. `employee-workday.repository.ts` queda en `repositories/workdays/`.

### Frontend que sí conviene tocar — P2

`pages/settings/components/` mezcla diálogos. El shell (`SettingsDialog`, `SettingsFormField`, `SettingsSummaryCard`, `SettingsResponsiveModal`, `SettingsDialogSection`) se queda en la raíz de `components/`. El resto baja a `absence/`, `locations/`, `whatsapp/`, `schedule/`, `reports/` y `employees/`. Los imports no salen de settings.

`components/operations/` es un solo feature (ficha de operación). 30 archivos empiezan a costar de escanear. Subcarpetas `ai/`, `shifts/` y `assignment/` están en el mapa como **opcionales**. La carpeta actual es coherente.

### Evaluado y dejado como está

- `database/migrations` (156 + 78 rollbacks): el orden numérico es el contrato del runner.
- `design-system/components` (45): kit de UI. Plano es lo correcto.
- `controllers/`, `routes/`, `schemas/`, `types/`, `constants/`: un archivo por recurso. El prefijo ya es el índice. Carpetas de un archivo no mejoran la cohesión.
- `jobs/` (17) y `middleware/` (14 de producción): un archivo por responsabilidad transversal.
- `frontend/src/hooks` y `frontend/src/api`: capa compartida entre pages y components. `hooks/company/` sería opcional y de poco valor mientras `useCompanySettings` lo usen operaciones, asistencia y settings.
- `frontend/src/utils`: `errors.ts`, `dates.ts`, `labels.ts`, `permissions.ts` se quedan. Un helper de una sola pantalla se mueve cuando se toque esa pantalla, no en un barrido.
- `website/`: marketing, tamaño chico. Hay subcarpetas vacías en `sections/` (`hero`, `narrative`, `product-experience`); borrarlas es limpieza, no arquitectura.

## Estructura objetivo

Detalle en `folder-modularization-proposed-tree.md`. Forma:

```text
backend/src/services/<dominio>/<archivo actual>
backend/src/repositories/<dominio>/<archivo actual>
backend/src/utils/<dominio>/<archivo actual>
```

Profundidad máxima: un nivel de dominio, más `whatsapp/router/` y `attachments/storage/` porque esas carpetas ya existen y tienen responsabilidad distinta (handlers vs provider). No aparece `interfaces/`, `factories/` ni `strategies/` nuevas.

Controllers, routes, schemas, types, constants, jobs y middleware siguen planos.

## Impacto de mover

- No hay alias de TypeScript ni en backend ni en frontend. Cada movimiento reescribe imports relativos: los del archivo (sube un `../`) y los de quien lo importa.
- Los tests de backend están al lado del fuente y `tsconfig` los excluye del build. `tsc` no detecta un import de test roto. Cada fase corre la suite unitaria del área.
- Hay `await import("./...")` de producción en `platform-company.service.ts` y `company-location-zone-defaults.service.ts`. Un codemod que solo vea `import ... from` los deja apuntando al path viejo.
- Tests `*.source-structure.guard.test.ts` y `*.source.test.ts` leen rutas literales (`src/services/daily-attendance-report.service.ts`, `src/services/bot/check-in-attendance.flow.ts`, etc.). Hay que actualizar la ruta en la misma PR que mueve el archivo.
- Barrrels reales: `routes/index.ts` (composition root HTTP; se queda) y `services/attachment-storage/index.ts` (se muda con el provider). En frontend, los barrels son del design system y de `entity-link`. No crear `index.ts` por dominio.
- CI (`.github`) no referencia paths `src/services/`. El acoplamiento a paths está en los tests de fuente.
- `test-helpers/mock-admin-alert-side-effects.ts` importa servicios por path dinámico.

Riesgo de regresión alto en las fases de operaciones, jornadas, ausencias y WhatsApp: ahí están los tests de concurrencia, multi-turno, leases y webhooks. El movimiento es mecánico; el peligro es un import cíclico nuevo o un `import()` olvidado, no un cambio de regla de negocio. La PR no debe aprovechar para "ordenar" funciones dentro del archivo.

## Convenciones para lo que se agregue después

Salen del layout real, no de una plantilla genérica.

**Cuándo crear un módulo.** Cuando un caso de uso nuevo pertenece a un dominio que ya tiene carpeta (`absence`, `whatsapp`, `operations`, …), el archivo nace ahí. Cuando el dominio todavía no tiene carpeta y va a tener más de un servicio, se crea `services/<dominio>/` en la misma PR. Un solo servicio transversal (`email`, `audit`, `lookup`) nace en la raíz de `services/`.

**Cuándo crear una subcarpeta.** Con una responsabilidad distinta y varios archivos, como el router o el storage provider. Tres archivos del mismo dominio no ganan una subcarpeta propia (`quota/`, `daily/`, `delivery/`).

**Qué es `utils` de verdad.** Kernel sin dominio: SQL, CSV, paginación, teléfono, redacción de logs, transacciones, `row-mappers`. Todo lo demás va a `utils/<dominio>/` o a una subcarpeta que ya exista (`admin-alert`, `payroll-receipts`, `geocoding`, `system-logs`).

**Qué no entra a `services/`.** Helpers importados por repositorios. Políticas puras sin IO pueden ir a `backend/src/domain/`, que hoy solo tiene badges y efectos operacionales de ausencia.

**Types, hooks, helpers de frontend.** El type de un recurso sigue en `frontend/src/types/<recurso>.ts`. El hook de datos sigue en `frontend/src/hooks/use<Recurso>.ts` mientras lo usen pages y components. Un helper usado por una sola pantalla vive junto a esa pantalla. `errors`, `dates` y `labels` se quedan en `utils/`.

**Tests.** Al lado del archivo que cubren, como ahora. Se mueven en la misma PR.

**`index.ts`.** Solo el composition root de routes y el barrel chico del storage provider. Un `index.ts` por dominio esconde ciclos y obliga a reexportar tests por accidente. Imports directos al archivo.

**Dirección de dependencia permitida.**

- `whatsapp` → `bot` → comandos de asistencia, ausencia y jornada.
- `bot` no importa el transporte Twilio ni la cuota.
- Recordatorios, payroll y alertas admin pueden llamar a `twilio-outbound` (puerto de envío).
- `operations` puede leer el query de impacto de ausencias. `absence` puede llamar a la asignación para aplicar un conflicto.
- `companies` compone settings de otros dominios. Esos calls cruzados se mantienen explícitos; `company.service.ts` no se parte en esta auditoría.
- `repositories` no importa `services`.

## Top 10 por impacto

1. Sacar la raíz de `services/` por dominios (fases 1 a 4). Es el cambio que evita que la carpeta vuelva a las 150 unidades.
2. Bajar helpers de dominio desde `utils/` sin invertir la capa.
3. Espejar repositorios solo cuando el service del dominio ya se movió.
4. Dejar `whatsapp-bot.service.ts` como fachada y, en una PR posterior de comportamiento, separar admisión, cuota y despacho al router. Primero la carpeta.
5. Partir `pages/settings/components` por diálogo. Blast radius local.
6. Conservar el `import()` de `platform-company` hacia el calendario de ausencias. Convertirlo en import estático puede cerrar el ciclo que ese `import()` abre.
7. Tratar operaciones y jornadas como carpetas hermanas con dependencia permitida, no como un solo saco ni como dos paquetes que no pueden verse.
8. No partir todavía `attendance.repository.ts`, `employee-workday.repository.ts` ni `attendance-notification.repository.ts`. Son agregados grandes, no carpetas mezcladas.
9. No partir `row-mappers.ts` en el mismo esfuerzo. Lo importan ~29 repositorios. Moverlo de carpeta no lo achica.
10. No migrar hooks, api y types del frontend a `features/`.

## Qué no se verificó

No se ejecutaron tests, lint ni build: la auditoría no cambia comportamiento. No se midió el grafo de imports del website más allá del tamaño de carpetas. El conteo de "dominio único" de algunos utils se usó como señal y después se corrigió a mano donde el prefijo mentía (`location-message-metadata.ts`, `absence-date.ts`).
