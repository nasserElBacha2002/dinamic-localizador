# 31 — QA visual y funcional de la demo (v2)

Entorno local, Dinamic Demo, 2026-10-25. Todo lo marcado como validado se ejecutó; el detalle de los fixes está en `34`.

En todas las capturas nuevas se verificó: sesión no-plataforma, teléfonos `+54911555500xx`, mails `@demo.dinamic.test`, y ningún token, cookie, contraseña, key de Maps ni SID.

## Bugs corregidos

| ID | Hallazgo | Fix | Evidencia |
|---|---|---|---|
| B-01 | "No voy" en ONE_TIME respondía un error técnico y no proponía reemplazos | `effectiveDate` solo para RECURRING, fechas `YYYY-MM-DD` | 3 tests de integración; solicitud real con 3 candidatos; SS-10B |
| B-02 | El filtro `confirmationStatus` se ignoraba y la indisponibilidad de la jornada no se veía | Filtro aplicado y `CONFIRMATION_STATUS_SQL` (prevalece `ew.unavailable_at`) en estadísticas, detalle de operación y reporte diario | Unitario + integración; API 12 / 1 / 1 / 10; SS-01, SS-10B |
| B-02b | La primera versión del fix de B-02 rompía `incident-details` con el filtro (parámetro duplicado, 500) | Parámetro renombrado a `@workdayConfirmationStatus` | Unitario; API 200 en los 7 endpoints |
| B-04 | Estadísticas › Incidencias mostraba "Sat Oct 24" para jornadas del 25/10 | `toDateOnlyString` en `operational-incident-details.repository.ts` | SS-18B (antes) / SS-18 (después) |
| T-01 | El test de migración de alertas restauraba `CK_waan_alert_type` sin `REPLACEMENT_REQUEST` y dejaba la base local rota | Lista del restore corregida; DDL de las migraciones 150 y 103 reaplicado en local | "No voy" vuelve a materializar la solicitud |

## Bugs que permanecen

| ID | Severidad | Hallazgo | ¿Afecta capturas? |
|---|---|---|---|
| B-03 | Media | El alta de empresa por plataforma habilitó seis módulos aunque se pidieron cuatro | No |
| Q-02 | Baja | Una llegada 12–29 min antes del inicio se ve "Temprano" en la lista y "En punto" en el detalle (Julián, Bruno) | Sí, entre SS-11 y SS-13/13B; no contradice ningún claim |
| Q-05 | Baja | La respuesta "reemplazo cubierto" por WhatsApp arma la hora en UTC (`toISOString`) | No (requiere Twilio) |
| Q-06 | Media | "Cubrir / reemplazar" desde la web no cierra la solicitud de reemplazo de WhatsApp, que queda PENDING | No; no decir que ambos caminos están integrados |
| Q-07 | Baja | El reporte mensual sigue leyendo `oa.confirmation_status` (no ve la indisponibilidad de jornada) | No |
| Q-08 | Baja | El XLSX del reporte no define anchos de columna; las etiquetas se cortan al abrirlo | Sí, SS-22 (NEEDS_EDIT) |
| Q-09 | Baja | En incidencias, el filtro de confirmación no aplica a las filas de cobertura y cambios | No |
| Q-10 | Baja | A 836 px, el título "Jornada e incidencias" queda debajo de los botones de acción | SS-13B (cosmético) |
| Q-11 | Baja | Valeria figura activa y como invitación pendiente; viene del alta (invitación + membresía SQL) | SS-27 (NEEDS_EDIT) |
| T-02 | Media | El test #7 de `admin-alert-migration` borra `CK_waan_alert_type` y `CK_waan_severity` en bases con tipos más nuevos | No; no correrlo contra la base demo |

**Cerrados sin cambio de código:**
- **Q-01:** era el tiempo de tolerancia; Camila y Pablo pasan a Ausente al cerrar la ventana.
- **Q-03:** no se reproduce en esta pasada.
- **Q-04:** el badge de ausencia en el detalle de la operación depende de `absenceOperationalIntegrationEnabled`, apagado en el tenant. No se activó porque cambia otros flujos.

## Assets recapturados

| Asset | Antes | Ahora |
|---|---|---|
| SS-01, SS-02 | B-02 visible (9 avisos) | READY: 1 aviso real, 4 recuadros |
| SS-04, SS-05 | Faltaba Centro | READY |
| SS-09, SS-14, SS-16, SS-24, SS-25, SS-28 | Pendientes | READY (layout compacto) |
| SS-10 | Antes de los fichajes | READY con estados finales |
| SS-10B | Evidencia del bug | READY: serie de cobertura |
| SS-11 | Spinners | READY |
| SS-13B | — | READY: Bruno pendiente, sin aprobar |
| SS-17 a SS-20 | Pendientes | READY |
| SS-21 | Bloqueado | READY: correo real |
| SS-22 | Bloqueado | NEEDS_EDIT: render real, etiquetas cortadas |
| SS-27 | Pendiente | NEEDS_EDIT: recorte |
| SS-06 | Mapa con error | Sigue BLOCKED (ver `32`) |

## Claims validados

| Claim | Evidencia |
|---|---|
| Llegada con ubicación por WhatsApp, validada contra un radio por servicio | Webhook local (sin teléfono real); SS-12; 22 m Válido, 190 m Pendiente |
| Fuera del radio pero dentro del margen queda en revisión, no se rechaza | Julián (aprobado), Bruno (pendiente) |
| Llegada tarde marcada | Sofía 17:05 "Tarde" |
| Salida con tiempo extra | Lucía 17:46 "+1 min" |
| Sin salida y sin llegada quedan visibles | SS-10, SS-11, SS-18, reporte |
| Aprobación manual con motivo, conservando la evidencia | Serie SS-13 |
| Ausencia justificada impacta la jornada | SS-11 "Justificado", reporte "1 justificadas" |
| Confirmación por WhatsApp | Pablo "Confirmado" |
| "Avisó que no asistiría" se cuenta en el inicio | SS-01 = 1 (Diego) |
| Si alguien avisa, el sistema propone candidatos de reemplazo | Solicitud con 3 candidatos (ONE_TIME) |
| Cobertura manual desde la web | SS-10B |
| Reporte diario por email con XLSX | Correo recibido por SMTP en un buzón de prueba (Mailpit) y adjunto con 4 hojas. Disparo manual oficial |
| Estadísticas generales, por empleado, por lugar e incidencias | SS-17 a SS-20 |

## Claims no verificados

| Claim | Motivo |
|---|---|
| Entrega real de WhatsApp (alertas al admin, recordatorios, mensajes al colaborador) | Sin Twilio; la notificación de reemplazo quedó encolada y sin enviar |
| El admin elige el reemplazo por WhatsApp | Requiere el quick reply con `provider_message_sid` de Twilio |
| Envío automático del reporte a las 08:00 | Se usó el disparo manual; el worker programado no se ejercitó |
| Mapa con radio en el alta y la ficha del servicio | `RefererNotAllowedMapError` en `localhost:8084` |
| Tendencias de varias semanas | El tenant tiene un solo día de datos; no se usó el seed histórico (ver `28`) |
| Reporte mensual | No ejercitado |
