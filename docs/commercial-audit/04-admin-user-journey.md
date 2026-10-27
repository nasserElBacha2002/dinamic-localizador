# 04 — Recorrido del administrador

El administrador de este documento es el OWNER o el ADMIN de la empresa cliente. El SUPERVISOR aparece donde el permiso cambia el recorrido. HR, OPERATOR y READ_ONLY no deberían tener capítulo propio en la presentación principal.

El colaborador no usa este panel.

## Qué ve al entrar

Nav real (`frontend/src/utils/company-modules.ts`), si los módulos y permisos están completos:

Inicio, Colaboradores, Grupos de trabajo, Clientes, Servicios, Operaciones, Asistencias, Ausencias, Recibos de sueldo, Estadísticas, Importación, Configuración, Usuarios de empresa, Seguridad.

Platform admin además ve Empresas de plataforma, Estado de servidores, Observabilidad WhatsApp, Costos, Logs y Simulador. **Esa sesión no se usa para grabar la demo.**

## Recorrido diario (el que hay que mostrar)

### 1. Abrir el día

Pantalla: `/` (`HomePage`, `HomeDashboardKpiCards`).

Responde, para hoy en el timezone de la empresa:

- Cuántas jornadas hay
- Cuántos ya están presentes
- Cuántos siguen pendientes
- Ausencias no justificadas
- Quién avisó que no asistiría
- Llegadas tarde
- Presentismo y puntualidad
- Revisión / geocerca
- Jornadas sin cierre de salida
- Operaciones con cobertura incompleta
- Ausencias justificadas

Cada cifra irregular enlaza a Estadísticas con el filtro ya aplicado (`statistics-deep-links`).

Si el módulo `reports` está apagado, este inicio no tiene esos KPIs. En la demo el módulo tiene que estar activo.

### 2. Bajar a la operación que importa

`/operations` lista estado, servicio, horario, tipo. `/operations/:id` muestra el equipo, los turnos, las jornadas y la asistencia de esa operación.

Ahí el administrador asigna, cancela, cierra una cobertura o pide una recomendación. No hay una pantalla separada llamada “incidencias”: la incidencia se lee en Inicio, en Asistencias, en la operación y en la pestaña Incidencias de Estadísticas.

### 3. Abrir un fichaje

`/attendance` filtra por validación, ubicación, puntualidad y salida. El detalle muestra coordenadas, distancia, origen WhatsApp o manual, y la revisión.

Acciones, si el rol las tiene:

| Acción | Permiso | Qué no hace |
|---|---|---|
| Aprobar o rechazar un pendiente | `attendance:review` | No reescribe la coordenada de WhatsApp |
| Cargar llegada o salida manual | `attendance:manual_create` | No fabrica `sourceMessageSid` ni simula un mensaje |
| Corregir un registro | `attendance:manual_edit` | Queda auditado como manual |

SUPERVISOR tiene revisión y carga manual. OPERATOR solo lee.

### 4. Resolver un “no voy”

Dos caminos distintos:

- **No disponibilidad de una jornada** (WhatsApp o el estado `UNAVAILABLE`): alerta y reemplazo por candidatos. La elección del candidato, en el código actual, la hace el responsable **respondiendo por WhatsApp**, no desde un wizard web equivalente.
- **Solicitud de ausencia** (`/absences/:id`): aprobar, rechazar o pedir información, y resolver el conflicto operativo (incluido `ASSIGN_REPLACEMENT` desde el panel).

No mezclarlos en la misma diapositiva.

### 5. Cerrar el día y mirar el período

- Al día siguiente, el mail + XLSX si el reporte diario está activo.
- Cuando hace falta un período: `/statistics`.

## Recorrido de configuración (una vez, y cuando cambia la regla)

Orden real de trabajo, no el orden visual de las tarjetas:

1. `/settings/company` — reglas de fichaje, horario, alertas, reporte.
2. `/clients` — clientes y formatos.
3. `/services/new` — lugar, mapa, radio.
4. `/employees/new` — persona y teléfono.
5. `/work-teams/new` — si repiten el mismo equipo.
6. `/operations/new` — trabajo, horario o turnos, tolerancias.
7. Dentro de la operación — asignar.
8. `/imports` — cuando el volumen no entra a mano.

Detalle paso a paso: documento `03`.

## Recorrido de una operación nueva

Pantalla: `OperationCreatePage` + `OperationForm`.

1. Elige servicio (el lugar ya existe).
2. Puntual o recurrente.
3. Un horario o varios turnos.
4. Si es recurrente, horario de la empresa o uno propio.
5. Tolerancias: deja las de la empresa o las pisa.
6. Guarda. Estado inicial `SCHEDULED`.
7. En el detalle, asigna personas o un grupo.
8. La jornada queda esperada. El WhatsApp de “te asigné” no sale en ese momento.

Estados que puede provocar después: pasar a en curso o cancelar; el job de ciclo de vida también promueve la puntual según el reloj. Reactivar una cancelada la vuelve a `SCHEDULED`.

## Qué puede modificar y qué solo mirar

|  | OWNER / ADMIN | SUPERVISOR | HR |
|---|---|---|---|
| Configuración de empresa | sí (ADMIN también, no es `users:manage`) | no | no |
| Usuarios | solo OWNER | no | no |
| Clientes, colaboradores | sí | no | colaboradores sí; clientes usan permiso de colaboradores |
| Servicios y operaciones | sí | lectura | no |
| Revisar y cargar asistencia | sí | sí | no |
| Ausencias y saldos | sí | no | sí |
| Estadísticas | sí | lectura | lectura |
| Export de reportes | sí (`reports:export`) | no | no |

ADMIN iguala a OWNER salvo `users:manage`, así que exporta. SUPERVISOR tiene `reports:read` y no `reports:export`. Evidencia: `backend/src/constants/company-permissions.ts`.

## Información que recibe sin entrar al panel

| Evento | Canal | Condición |
|---|---|---|
| Colaborador no disponible | WhatsApp | Alertas activas, destinatario operacional, modo que no lo apague |
| Pedido de reemplazo con hasta 3 opciones | WhatsApp | Igual |
| Falta confirmación, falta llegada, falta salida | WhatsApp o solo el mail diario | Depende de `adminAlertDeliveryMode` |
| Umbral de presentismo cruzado | WhatsApp | Alertas de umbral activas |
| Ubicación reenviada (intento no confiable) | WhatsApp si la categoría seguridad está activa; si no, solo auditoría | `FORWARDED_LOCATION_REJECTED` |
| Solicitud de ausencia pendiente | WhatsApp, salvo modo email diario | `ABSENCE_REQUEST_PENDING` |
| Resumen del día anterior | Email + XLSX | Reporte diario activo y destinatario con email |
| Resumen del mes anterior | Email + XLSX | Worker mensual + el mismo flag del diario. Sin pantalla |

## Un día tipo, en una frase por hora

| Momento | Qué hace |
|---|---|
| Antes del turno | Mira quién confirmó y quién dijo que no. Cubre con reemplazo |
| Al inicio | Mira pendientes de llegada. Si alguien no ficha, recibe alerta o lo ve en Inicio |
| Durante | Abre un fichaje en revisión (cerca del radio) y lo aprueba o lo rechaza |
| Al cierre | Mira quién no marcó salida |
| Día siguiente | Lee el correo. Si el patrón se repite, abre Estadísticas |

## Qué no pedirle que haga en la demo

- Entrar a observabilidad, costos de Twilio, logs o simulador
- Crear la empresa (eso es Dinamic)
- Explicar la diferencia entre OWNER y ADMIN
- Cargar un recibo de sueldo en el mismo relato del fichaje
- Mostrar el formulario de asistencia de prueba

## Dónde se cruza con la historia del colaborador

La asignación en el panel crea la jornada. A partir de ahí la historia sigue en el teléfono del colaborador (documento `05`) y vuelve al panel como registro, alerta o KPI. El punto de encuentro visible es la fila de asistencia y la tarjeta de Inicio.
