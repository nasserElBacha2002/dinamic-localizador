# 07 — Incidencias, ausencias, alertas y reemplazos

No hay un módulo llamado “Incidencias” en el menú. Hay jornadas que no cierran como se esperaba, y el sistema las muestra en Inicio, en Asistencias, en la operación, en Estadísticas → Incidencias y en el correo diario.

Tipos de alerta admin (`backend/src/constants/admin-alert.ts`):

`EMPLOYEE_UNAVAILABLE`, `MISSING_CHECKIN_AFTER_OPERATION` (legacy, ya no manda WhatsApp), `FORWARDED_LOCATION_REJECTED`, `ABSENCE_REQUEST_PENDING`, `ATTENDANCE_THRESHOLD_CROSSED`, `ATTENDANCE_CONFIRMATION_MISSING`, `MISSING_CHECKIN_AFTER_START`, `MISSING_CHECKOUT_AFTER_END`, `REPLACEMENT_REQUEST`.

Worker: `admin-alert.job.ts`. Si el worker o el flag `adminAlertsEnabled` están apagados, la detección puede existir y la alerta no sale.

Modo `DAILY_EMAIL`: confirmación faltante, falta de llegada y falta de salida van al informe por correo, no como WhatsApp urgente. Siguen pudiendo ser urgentes: no disponibilidad, umbral de presentismo y pedido de reemplazo (`admin-notification-channel-policy.ts`).

## Catálogo de escenarios

| Qué ocurrió | Cómo se entera el sistema | Dónde queda | Quién recibe algo | Qué puede hacer el administrador |
|---|---|---|---|---|
| Confirmó y no fue | La jornada termina sin llegada válida y la confirmación estaba en CONFIRMED. El reporte lo clasifica `CONFIRMED_BUT_ABSENT` | Estadísticas, XLSX diario y mensual | El correo. No hay alerta WhatsApp con ese nombre | Filtrar el período y abrir la jornada |
| Avisó que no iba | `markAssignmentUnavailable` → `confirmation_status = UNAVAILABLE` | Jornada y pedido de reemplazo | WhatsApp `EMPLOYEE_UNAVAILABLE` a destinatarios operativos | Cubrir con un candidato o asignar a mano |
| Llegó tarde, dentro de tolerancia | `punctuality_status = LATE`, validación igual `VALID` | Asistencia y KPI “Llegadas tarde” | No hay alerta dedicada | Verlo en Inicio o en el detalle |
| Llegó fuera de la ventana | `OUTSIDE_TIME_WINDOW` + `REJECTED` | Asistencia | No hay alerta dedicada de “tarde extrema” | Revisión manual si corresponde corregir |
| Nunca fichó la llegada | Ventana dinámica `MISSING_CHECKIN_AFTER_START` (`admin_alert_max_lateness_minutes`, default 60) | Alerta y, al cierre, incidencia `MISSING_CHECKIN` / `NO_PUNCH` | WhatsApp o solo el mail, según el modo | Cargar asistencia manual |
| Nunca fichó la salida | `MISSING_CHECKOUT_AFTER_END` (`admin_missing_checkout_delay_minutes`, default 30) | Jornada abierta, KPI “Sin cierre” | Igual que la llegada | Cargar la salida manual |
| Fichó fuera del radio, dentro del margen | `PENDING_REVIEW` | Asistencia | KPI “Revisión / geocerca”. No hay WhatsApp específico | Aprobar o rechazar con motivo |
| Fichó lejos | `REJECTED` + `OUTSIDE_GEOFENCE` | Asistencia, y el colaborador recibe el rechazo | Reportes y estadísticas | Dejar el rechazo o corregir a mano si hubo un error de terreno |
| Reenvió una ubicación | Metadata `Forwarded` / `FrequentlyForwarded` | No se crea asistencia. Sí alerta `FORWARDED_LOCATION_REJECTED` | WhatsApp solo si la categoría seguridad está activa; si no, auditoría | No “arreglar” la coordenada. Decidir por otro medio |
| Asignación pisada o solapada | Al asignar: bloqueo si es el mismo turno solapado; aviso si es otra operación | La asignación no se crea, o se crea con warning | No | Corregir el equipo en la operación |
| Operación sin gente suficiente | No hay cupo guardado. “Cobertura incompleta” compara lo esperado contra lo cubierto en estadísticas | Inicio, “Cobertura incompleta”, `operation_coverage_events` | No hay WhatsApp masivo de “falta personal” | Asignar, usar recomendación o reemplazo |
| Pidió ausencia | Solicitud `PENDING` | `/absences` | `ABSENCE_REQUEST_PENDING` (en modo email diario puede no ser urgente) | Aprobar, rechazar, pedir información |
| Ausencia aprobada choca con una jornada | Conflicto operativo | Ficha de la ausencia | Según integración operativa | Resolver, incluido asignar reemplazo desde el panel |
| Alguien fichó durante una ausencia aprobada | El check-in se acepta y se marca el conflicto | Asistencia + conflicto | Mensaje al colaborador | Revisar cuál de las dos verdades queda |
| Error de carga, sin WhatsApp | No se detecta solo | — | — | Alta manual |
| Corrección posterior | Edición manual auditada | Detalle de asistencia | — | `attendance:manual_edit` |

“Intentó falsificar la ubicación” solo está implementado como **rechazo de ubicación reenviada**. No hay detección de mock GPS, ni de apps de ubicación falsa, ni de teleport. No vender eso.

“Asignación incorrecta” no tiene un detector autónomo. El sistema evita solapes duros al momento de asignar.

## Ausencias (el trámite, distinto del “hoy no voy”)

Módulo `absences`.

- Tipos y políticas: API y diálogos de configuración
- Calendario laboral y feriados: API `/absence-calendars`. No hay una pantalla de calendario mensual en el menú
- Saldos y movimientos: `absence-balance.service.ts`
- Adjuntos: si se activan, exigen GCS
- Alta por administrador o por el flujo de WhatsApp
- Sync de jornadas: `absence-workday-sync.job.ts` (cada 60 s)

En la presentación principal alcanza con: la persona pide la ausencia por WhatsApp, el responsable la ve y la decide, y la jornada queda justificada. Saldos, feriados y adjuntos van al anexo de RR.HH. si el comprador lo pide.

## Reemplazo: qué está hecho

```text
El colaborador marca no disponibilidad de esa jornada
        → employeeWorkdayService
        → replacementRequestService.findOrCreateRequest   (PENDING, idempotente)
        → candidatos: recomendación individual, top 20
            filtrados por disponibilidad del intervalo
            se guardan hasta 3
        → WhatsApp REPLACEMENT_REQUEST a responsables operativos
        → el responsable responde replacement_option_1 | 2 | 3
        → nueva asignación origen COVERAGE
        → nueva jornada para quien cubre
        → estado COVERED
        → texto de confirmación al responsable
```

Evidencia: `replacement-request.service.ts`, migración `150_whatsapp_replacement_requests.sql`, `employee-availability.service.ts`.

| Paso del relato comercial | Estado |
|---|---|
| La persona avisa | OPERATIVO |
| Queda registrado | OPERATIVO |
| El responsable se entera por WhatsApp | OPERATIVO si alertas y destinatarios están activos |
| Hay candidatos ordenados | OPERATIVO |
| El responsable elige en el chat | OPERATIVO |
| Se reasigna | OPERATIVO |
| Se avisa al colaborador que cubre | PARCIAL. Este servicio confirma al admin. No hay evidencia ahí de un WhatsApp automático al reemplazante |
| El responsable elige los mismos 3 candidatos en una pantalla web dedicada | No está como flujo equivalente. Puede asignar cobertura a mano en la operación (`asCoverage`) o resolver un conflicto de ausencia con `ASSIGN_REPLACEMENT` |

Estados del pedido: `PENDING`, `COVERED`, `EXPIRED`, `FAILED`.

## Qué mira el algoritmo (y qué no)

Versión `workforce-recommendation-v1` (`backend/src/constants/workforce-recommendation-v1.ts`). Es un score de compatibilidad, no una probabilidad. El comentario del código lo dice.

Sin cliente en el servicio:

| Factor | Peso | Qué mide |
|---|---|---|
| Afinidad de equipo | 0.45 | Con cuánta gente de los ya asignados trabajó antes (90 días peso 1, hasta 365 peso 0.5, más viejo 0.2). Se satura |
| Experiencia en el lugar | 0.30 | Jornadas activas previas en ese servicio. Tope 5 |
| Cercanía | 0.25 | Centroide de la zona del colaborador contra el pin del servicio, o misma zona. Buckets 2 km, 5 km, 15 km |

Con cliente en el servicio, los tres bajan y entra afinidad de cliente con peso 0.20 (0.36 / 0.24 / 0.20 / 0.20).

Si falta historia de equipo o falta la zona, ese factor se omite y el resto se renormaliza.

Para el reemplazo, además, la persona tiene que estar `AVAILABLE` en ese intervalo: activa y sin ausencia aprobada que lo ocupe. Se excluye a quien ya está en la cadena de ausentes de ese pedido.

Hay un segundo algoritmo, `workforce-team-recommendation-v1`, para armar un equipo de N personas. N se pide en el momento (2–20). No es una vacante guardada en la operación.

No hay modelo de lenguaje, embeddings ni entrenamiento.

## Cómo decirlo en la demo

> Cuando alguien avisa que no puede ir, el responsable recibe hasta tres personas ordenadas por si ya trabajaron con ese equipo, si conocen el lugar y si viven cerca. Elige una en el mismo WhatsApp y la cobertura queda asignada.

No decir “la IA elige sola” ni “detectamos GPS falso”.
