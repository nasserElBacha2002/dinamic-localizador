# 29 — Ledger de assets de producción (v2)

Carpeta: `presentation-production/`. Todas las capturas son de la sesión de Valeria Gómez (OWNER, sin plataforma), tenant local Dinamic Demo.

- **Escritorio**: 1024 px CSS, a 3824×2160.
- **Compacto**: 836 px CSS, sin barra lateral. El panel del navegador quedó angosto en la segunda pasada y el usuario aprobó capturar así.

Estados: **READY** (usable tal cual), **NEEDS_EDIT** (real, falta recorte o una toma humana menor), **BLOCKED** (ver `32`), **OMITTED** (decisión).

## Capturas

| Asset | Archivo | Estado | Nota |
|---|---|---|---|
| SS-01 | `screenshots/SS-01.png` | READY | Escritorio, después de B-02. Muestra 11 jornadas, 7 presentes, 1 pendiente, 2 ausencias no justificadas, avisó que no asistiría 1, 1 tarde, 4 sin cierre y 1 justificada |
| SS-02 | `screenshots/SS-02-annotated.png` | READY | SS-01 con cuatro recuadros: Presentes, Avisó que no asistiría, Llegadas tarde y Sin cierre. El texto de las llamadas lo agrega diseño |
| SS-03 | `screenshots/SS-03.png` | READY | Tres clientes |
| SS-04 | `screenshots/SS-04.png` | READY | Hotel Central, pestaña Servicios: Centro y Palermo |
| SS-05 | `screenshots/SS-05.png` | READY | Los cuatro lugares con 150 m. La lista no tiene columna de cliente; el nombre del lugar lo incluye |
| SS-06 | `screenshots/SS-06-sin-mapa.png` | BLOCKED | `RefererNotAllowedMapError`: la key no autoriza `localhost:8084`. Ver `32` |
| SS-07 | `screenshots/SS-07.png` | READY | — |
| SS-08 | `screenshots/SS-08.png` | READY | — |
| SS-09 | `screenshots/SS-09.png` | READY | Compacto. Las cuatro operaciones del 25/10; los estados se truncan ("Fin…", "Pro…") |
| SS-10 | `screenshots/SS-10.png` | READY | Escritorio. Palermo con Lucía (16:31 → 17:46, +1 min), Mateo (sin salida), Sofía (17:05, tarde), Pablo (confirmado, sin registro), Camila y Nina. Nina figura "Sin registro" (Q-04) |
| SS-10B | `screenshots/SS-10B-no-disponible.png`, `SS-10B-dialogo-cobertura.png`, `SS-10B.png` | READY | Diego "No disponible" → diálogo "Cubrir / reemplazar" con Sofía → Sofía asignada y Diego "Cancelada" en el historial. Cobertura desde la web |
| SS-10B (evidencia) | `screenshots/SS-10B-evidencia-bug.png` | OMITTED | Evidencia interna de B-01 antes del fix |
| SS-11 | `screenshots/SS-11.png` | READY | Escritorio, 8 filas: válido, tarde, fuera del radio aprobado, sin llegada (Ausente), justificado, con y sin salida. Sin spinners |
| SS-12 | `screenshots/SS-12.png` | READY | Ver Q-02 |
| SS-13 | `screenshots/SS-13.png` (+ serie de respaldo) | READY | Julián, aprobado a las 17:51 |
| SS-13B | `screenshots/SS-13B-bruno-detalle-pendiente.png`, `SS-13B-bruno-dialogo.png` | READY | Compacto. Bruno a 190.1 m, "Pendiente", diálogo "Validación manual: aprobar" vacío. **Sin aprobar**, reservado para VIDEO-07 |
| SS-14 | `screenshots/SS-14.png` | READY | Compacto. "Registrar llegada" de Camila, vacío, sin guardar |
| SS-15 | `screenshots/SS-15.png` | READY | — |
| SS-16 | `screenshots/SS-16.png` | READY | Compacto. Ausencia de Nina, Salud, Aprobada, 25/10 (tomada antes del corrimiento de fechas) |
| SS-17 | `screenshots/SS-17.png` | READY | Escritorio. Pestaña General, 15 KPIs reales del día |
| SS-18 | `screenshots/SS-18.png` | READY | Escritorio. Incidencias: cobertura (Diego), llegada sin salida, sin fichaje y sin confirmar. Fecha corregida (ver `34`) |
| SS-18B | `screenshots/SS-18B-evidencia-fecha-bug.png` | OMITTED | Evidencia interna: "Sat Oct 24" antes del fix |
| SS-19 | `screenshots/SS-19.png` | READY | Escritorio. Por empleado; presentismo "muestra insuficiente" porque hay un solo día |
| SS-20 | `screenshots/SS-20.png` | READY | Escritorio. Por servicio: Clínica 100 %, Palermo 60 %, Torre 0 %. Recortar los filtros en diseño |
| SS-21 | `screenshots/SS-21.png` | READY | Correo real recibido en Mailpit: "Reporte diario de asistencia 2026-10-24 — Dinamic Demo", adjunto XLSX, 11 incidencias. **Fecha 24/10** por el corrimiento (ver `28`) |
| SS-22 | `screenshots/SS-22.png` | NEEDS_EDIT | Render real de la hoja Resumen (LibreOffice headless) del XLSX recibido. Las etiquetas se cortan porque el archivo no define anchos de columna. Para una toma más legible: abrir `reports/reporte-asistencia-2026-10-24.xlsx` en Excel, ensanchar la columna A y capturar |
| SS-23 | `screenshots/SS-23.png` | READY | — |
| SS-24 | `screenshots/SS-24.png` | READY | Compacto. Modal "Alertas y reporte diario". Sin claves ni SID |
| SS-25 | `screenshots/SS-25.png` | READY | Compacto. El grupo real es "Equipo Hotel Central" (7 integrantes), no "Recepción Palermo" como pedía `18` |
| SS-26 | — | OMITTED | `18` |
| SS-27 | `screenshots/SS-27.png` | NEEDS_EDIT | Compacto. Valeria aparece activa y también como invitación pendiente (resto del alta). Recortar a la tabla de usuarios más la invitación de Marina |
| SS-28 | `screenshots/SS-28.png` | READY | Compacto. Palermo, 26/10 09:00–17:00, tolerancias heredadas, **sin guardar** |

## Videos

| Asset | Estado | Motivo |
|---|---|---|
| VIDEO-01, 04, 06, 08 | BLOCKED | El agente no graba pantalla. Datos listos |
| VIDEO-02, 03 | BLOCKED | Necesitan teléfono real con WhatsApp y número Twilio |
| VIDEO-05 | BLOCKED | El producto ya propone candidatos (B-01 fixed), pero la elección del admin es por WhatsApp y requiere Twilio. La parte web (cobertura manual) se puede grabar |
| VIDEO-07 | BLOCKED | Solo falta grabar: Bruno sigue pendiente a 190 m |
| VIDEO-09 | OMITTED | Depende de 01, 02, 04 y 05 |

## Reportes y evidencia

| Archivo | Estado | Uso |
|---|---|---|
| `emails/reporte-diario-2026-10-24.eml` | READY | Correo crudo recibido por SMTP (Mailpit) |
| `reports/reporte-asistencia-2026-10-24.xlsx` | READY | Adjunto real: Resumen, Jornadas, Incidencias, Servicios |
| `reports/webhook-local-transcript.txt` | READY (interno) | Mensajes al webhook local y TwiML devuelto. **No es captura de WhatsApp** |
