# 08 — Estadísticas, reportes y exportaciones

Separar lo que un responsable mira para operar de lo que una gerencia mira para un período. Las dos salen de las mismas jornadas. No hay un data warehouse aparte.

Fuente de agregación: `statistics.repository.ts`, proyección `statistics-canonical-attendance.ts`, incidencias `operational-incident-statistics.repository.ts`. API: `/api/companies/:companyId/statistics/attendance/*`. Permiso de lectura `reports:read`. Export `reports:export`. Módulo `reports`.

## Operativo: el día

### Inicio `/`

Pregunta: ¿qué está pasando hoy?

| Indicador en pantalla | De dónde sale |
|---|---|
| Jornadas programadas | `GET .../statistics/attendance/summary` del día, timezone de la empresa |
| Presentes | summary `presentWorkdays` |
| Pendientes / esperadas | `expectedOpenWorkdays` |
| Ausencias no justificadas | `absentWorkdays` |
| Avisó que no asistiría | workday-details con `confirmationStatus=UNAVAILABLE` |
| Llegadas tarde | `lateWorkdays` |
| Presentismo | presentes / (presentes + ausentes) |
| Puntualidad | en hora / (en hora + tarde) |
| Revisión / geocerca | irregularidades de validación y ubicación |
| Sin cierre | jornadas con llegada y sin salida |
| Cobertura incompleta | operaciones que no cierran cobertura |
| Ausencias justificadas | `justifiedWorkdays` |

Archivo de labels: `frontend/src/pages/home/HomeDashboardKpiCards.tsx`.

También lista operaciones del día (`useOperations`). Es la pantalla de apertura de la demo.

### Asistencias `/attendance`

Pregunta: ¿qué fichaje concreto quiero ver?

Filtros por operación, colaborador, servicio, turno, validación, ubicación, puntualidad, estado de salida y fechas. Export CSV de la lista (`attendance:export`).

### Operación `/operations/:id`

Pregunta: ¿esta operación de hoy está cubierta y quién ya fichó?

### Correo del día siguiente

Job `daily-attendance-report.job.ts`.

| | |
|---|---|
| Cuándo | Hora local `daily_attendance_report_time` (default 08:00), con catch-up |
| Flag | `daily_attendance_report_enabled` + worker de entorno |
| Formato | Email HTML/texto + adjunto XLSX |
| Contenido | Jornadas, tardanzas, sin llegada, sin salida, avisó que no va, confirmó y faltó, sin aviso, pendientes de revisión, rechazadas, geocerca, top de incidencias |
| Destinatarios | Alert recipients con email habilitado para el reporte |
| Disparo manual | `POST .../daily-attendance-reports/trigger` |
| Corridas | `company_daily_attendance_report_runs` y deliveries |

Esto es el reporte operativo. En la presentación: una captura del mail y una hoja del Excel, no el configurador.

## De gestión: el período

### Estadísticas `/statistics`

Pestañas (`StatisticsPage.tsx`):

| Pestaña | Pregunta |
|---|---|
| General | Cómo viene el período: serie, distribución, excepciones |
| Por empleado | Quién falta, quién llega tarde, quién cumple |
| Por operación | Qué operaciones se caen |
| Por servicio / ubicación | Qué lugares concentran problemas |
| Incidencias | Qué tipos de falla hubo |

Filtros reales (`statistics.schema.ts` / URL state): rango de fechas, operación, servicio, colaborador, tipo y estado de operación, confirmación, estado efectivo, validación, ubicación, puntualidad, completitud del fichaje, cobertura incompleta, turno.

Métricas que el código agrega y que sirven en una demo:

| Métrica | Por qué vende | Origen |
|---|---|---|
| Presentismo | La pregunta de gerencia | summary `attendanceRate` |
| Puntualidad | Distinta de “fue o no fue” | `punctualityRate` |
| Llegadas tarde | Hábito, no anécdota | `lateWorkdays` |
| Confirmó y no fue | La falla más cara de contar a mano | agregador del reporte / incidencias |
| Fuera de geocerca y pendientes de revisión | Evidencia de lugar | `locationStatus`, `validationStatus` |
| Sin llegada / sin salida / sin fichar | Jornada incompleta | `PUNCH_COMPLETENESS_*` |
| Cobertura | Operaciones que quedaron cortas de personas | `incompleteCoverageOperations`, `coverage_rate` |
| Horas | Volumen trabajado | hojas y KPIs de horas (incluido extra donde el summary lo expone) |
| Corte por cliente | Solo indirecto: el servicio tiene cliente y la pestaña es por servicio | No hay pestaña “Por cliente” |

No afirmar un ranking de clientes como pantalla propia. Se puede filtrar servicios de un cliente y mostrarlo, si los datos demo están así cargados.

Export desde la UI: CSV/XLSX con `export=true` (`ExportActionButtons.tsx`), permiso `reports:export`.

### Correo mensual

Job `monthly-attendance-report.job.ts`.

| | |
|---|---|
| Cuándo | Día 1, después de la hora de reporte, sobre el mes anterior en el timezone de operación |
| Condición | Worker mensual **y** el mismo flag del reporte diario |
| Formato | Email + XLSX de 5 hojas: Resumen, Empleados, Servicios, Incidencias, Horas |
| Destinatarios | Los mismos emails del diario |
| UI | No hay toggle ni vista previa |

Es el reporte ejecutivo. En la presentación se puede mostrar el archivo ya generado. No mostrar la configuración, porque el cliente no encuentra un “reporte mensual” en pantalla. Estado: OPERATIVO en backend, IMPLEMENTADO_NO_EXPUESTO como producto configurable.

## Alertas que parecen reporte y no lo son

`ATTENDANCE_THRESHOLD_CROSSED` (`attendance-threshold-alert.service.ts`) avisa por WhatsApp cuando el presentismo de una persona cruza el umbral configurado. Es gestión, no el Excel.

## Recibos

`/payroll-receipts` exporta y notifica otra cosa: documentos de sueldo. No alimenta presentismo. Dejarlo fuera del capítulo de reportes de asistencia.

## Qué mostrar y qué no

| Mostrar | Dejar en anexo o fuera |
|---|---|
| Inicio con un día que tenga tarde, ausencia y pendiente | Definición de cada columna del XLSX |
| Pestaña General con el período de la demo | Filtros avanzados todos abiertos a la vez |
| Pestaña Incidencias con 4–5 tipos visibles | Query SQL |
| Una página del mail diario | Configuración de workers |
| Portada del XLSX mensual | El hecho de que el mensual no tiene pantalla |

## Fortaleza comercial

El producto puede decir, con datos que realmente calcula:

> A la mañana se ve el día. Al día siguiente llega el detalle. En el mes se ve el patrón por persona, por lugar y por tipo de incidencia.

Eso está implementado. Depende de que el módulo reports esté activo, de que haya jornadas, y de que los workers de correo estén encendidos en el ambiente donde se graba o se envía.
