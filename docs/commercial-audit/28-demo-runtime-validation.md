# 28 — Validación del entorno de demo (runtime)

Fecha: 2026-10-25, hora de Buenos Aires. Las credenciales se usaron solo para iniciar sesión y no figuran en ningún archivo.

## Resultado

**Demo ejecutada en entorno LOCAL aislado.** Producción se revisó solo en lectura y se descartó. No se tocó ningún dato productivo.

## 1. Producción (descartada)

| Verificación | Resultado |
|---|---|
| URL | `https://dinamicoperations.com`, producción según `deploy/nginx.dinamicoperations.com.conf.template` |
| Sesión | Admin de plataforma. El menú muestra Empresas de plataforma, Servidores, Observabilidad, Costos, Logs y Simulador |
| Tenants | Dinamic Systems (productivo), Dinamic Clean (265 colaboradores con datos de aspecto real), pruebas-nasser (personas y teléfonos reales) |
| Decisión | Ningún tenant apto. Se pasó a local por decisión del responsable |

## 2. Entorno local usado

| Verificación | Resultado |
|---|---|
| SQL Server | Contenedor `dinamic-attendance-sqlserver`, `localhost:1435` |
| Migraciones | 153 aplicadas, 0 pendientes (`npm run migrate:status`) |
| Backend | `npm run dev` en `:3004`, con dos variables de proceso que no modifican `.env`: `EMAIL_TRANSPORT=console` (ningún mail sale) y `TWILIO_WHATSAPP_NUMBER=whatsapp:+10000000000` (número ficticio para que el webhook procese) |
| Frontend | Build de producción (`npm run build` + `vite preview`) en `:8084`, para que no aparezca el botón de TanStack Devtools del modo dev |
| Twilio | Sin credenciales: no hay envíos salientes de WhatsApp. Las respuestas del bot son el TwiML real del webhook |
| Tenant | **Dinamic Demo** (`A8ED3D58-…`), creado con `POST /api/platform/companies` |
| Sesión de capturas | **Valeria Gómez**, OWNER de Dinamic Demo, `is_platform_admin = false`. El menú no muestra opciones de plataforma |
| Módulos | attendance, operations, absences, reports. payroll_receipts y bot_simulator desactivados (ver desvío D-03) |
| Settings | Radio 150, margen 80, temprana 30, tarde 15, horario 08:00–17:00, alertas admin activas, reporte diario 08:00 |

### Única escritura directa en la base (documentada)

La invitación de dueña solo se acepta con un token que viaja por mail, y el transporte de consola lo oculta. Con autorización del responsable:

1. Se creó la usuaria con el script oficial: `npm run admin:create` con `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` como variables de proceso; la contraseña no se guarda en archivos.
2. `INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)` con OWNER / ACTIVE / 1, solo para esa usuaria y ese tenant local.

La invitación OWNER original sigue PENDING, sin uso.

## 3. Matriz del dataset (13 / 20 / 21)

| Elemento | Esperado | Existe | Estado | Acción / desvío |
|---|---|---|---|---|
| Tenant | Dinamic Demo | Sí | OK | API platform |
| Admin | Valeria Gómez, ADMIN/OWNER | Sí | OK | admin:create + membresía SQL |
| Supervisora | Marina Ruiz | Invitada | PENDIENTE | La invitación no se puede aceptar sin SMTP |
| Clientes | Hotel Central, Clínica Norte, Torre Corporativa | Sí | OK | — |
| Servicios | Palermo, Centro, Belgrano, Microcentro | 3 de 4 | PARCIAL | Centro se crea en VIDEO-01, que no se grabó |
| Colaboradores | 12, teléfonos `+54 9 11 5555-0001…0012` | Sí | OK | — |
| Grupos | Hotel Central, Clínica, Torre | Sí | OK | — |
| Recepción Hotel Central | Hoy 09:00–17:00 | Hoy **17:00–17:45** | DESVÍO D-01 | No se pueden crear operaciones en el pasado |
| Guardia clínica | Hoy 08:00–16:00 | Hoy **17:00–18:00** | DESVÍO D-01 | Ídem |
| Cobertura torre | Hoy 18:00–23:00 | Hoy **19:00–23:00** | DESVÍO D-01 | Ídem |
| Cierre de ayer (D−1) | Operación de ayer | No | NO CREABLE | `validateOperationStartNotInPast` lo rechaza |
| Lucía | Válida + salida | Sí | OK | Llegada 16:31 a 22 m, salida 17:46 a 14 m |
| Mateo | Sin salida | Sí | OK | Llegada 16:31 a 29 m, sin salida |
| Sofía | LATE | Sí | OK | Llegada 17:05 a 30 m → "Tarde" |
| Julián | PENDING_REVIEW, 150–230 m | Sí | OK, luego aprobado | Llegada a 189 m; aprobado a mano 17:51 |
| Irene | Válida | Sí | OK | Llegada 16:31 a 19 m |
| Camila | Sin llegada | Sí | OK | Sin mensajes |
| Diego | UNAVAILABLE + reemplazo | Parcial | BUG B-01 | Queda `unavailable_at`, pero el flujo devuelve un error y el reemplazo no tiene candidatos |
| Pablo | Confirmó D−1 y faltó | Confirmó hoy y faltó | DESVÍO D-02 | Confirmación por menú "Confirmo asistencia" el mismo día |
| Nina | Ausencia justificada | Sí | OK | Salud, aprobada por admin |
| Destinatario de alertas y reporte | `operaciones@demo.dinamic.test` | Valeria (usuario + teléfono `…0013`) | DESVÍO D-04 | Los destinatarios de mail sueltos están deprecados (410) |

## 4. Cómo se generaron los estados de asistencia

Las llegadas y salidas se generaron con POST form-encoded al webhook local `POST /api/webhooks/twilio/whatsapp`, con el mismo formato que envía Twilio. Pasan por el motor real (`evaluateAttendanceCheckIn`, geocerca, ventana de llegada) y quedan con `is_simulation = 0`. La transcripción completa está en `presentation-production/reports/webhook-local-transcript.txt`.

**No son evidencia de WhatsApp.** Ningún teléfono real envió ni recibió mensajes, y ninguna captura de chat sale de ahí.

## 5. Desvíos

- **D-01.** Horarios corridos a la tarde: la creación rechaza horarios ya pasados y la demo se hizo después de las 16:00.
- **D-02.** Sin D−1: la confirmación de Pablo es del mismo día.
- **D-03.** El alta de empresa ignoró `modules: [...]` y habilitó los seis módulos; se corrigió con `PATCH /modules`.
- **D-04.** El reporte diario usa como destinatarios a los receptores de alertas que tienen email de usuario.
- **D-05.** El nombre de las operaciones es el nombre del servicio. "Recepción mañana", "Guardia clínica" y "Cobertura torre" no existen como texto en el producto.

## 6. Segunda pasada (2026-10-25, 18:00–18:45 BA)

### Entorno

- **Backend reiniciado con variables de proceso** (sin tocar `.env`):
  - SMTP hacia Mailpit;
  - `TWILIO_WHATSAPP_NUMBER=whatsapp:+10000000000`;
  - `NODE_TLS_REJECT_UNAUTHORIZED=0`, porque el servicio de mail exige STARTTLS con `SMTP_SECURE=false` y Mailpit usa un certificado autofirmado.
- **Mailpit** en el contenedor `dinamic-demo-mailpit`: SMTP en `127.0.0.1:1026`, UI en `127.0.0.1:8026`.
- **Base local:** los constraints `CK_waan_*` se restauraron con el DDL de las migraciones 150 y 103 (ver `34`).

### Datos nuevos (por API y UI)

| Dato | Detalle |
|---|---|
| Servicio Hotel Central — Centro | Av. Corrientes 1150, San Nicolás, radio 150 |
| Operación Clínica Norte 18:30–20:00 | Hugo válido a 29 m; Bruno pendiente a 190 m (sin aprobar, para VIDEO-07) |
| Torre Corporativa 19:00 | Diego repitió "No voy" después del fix de B-01: solicitud con 3 candidatos. Sofía lo cubre desde la web |

### Seed histórico: no usado

`npm run seed:historical-operations` crea grupos visibles con el prefijo "[AI_HISTORY_SEED]" (la palabra IA no puede aparecer en capturas) y asistencias sin salida que inflarían "Sin cierre". Las estadísticas se capturaron con los datos reales del día.

### Corrimiento de fechas para el reporte D−1

El disparo manual solo acepta D−1 y días de catch-up (`validateManualReportDate`). Para el 25/10 devolvió `OUTSIDE_CATCHUP`, y no hay override de reloj.

**Pasos, en este orden:**
1. Se tomaron todas las capturas que dependen del día.
2. Se corrieron −1 día las dos operaciones ya terminadas (Hotel Central — Palermo y Clínica Norte de las 17:00), con todas sus fechas:
   - operación, jornadas y asignaciones;
   - llegadas, salidas y revisión;
   - eventos de cambio;
   - la ausencia de Nina.
   Fueron 26 filas en una transacción, con respaldo previo en `/tmp/demo-shift-backup.json`. Los `created_at` quedaron intactos.
3. Se disparó `POST daily-attendance-reports/trigger` con `reportDate=2026-10-24`.
   - Primer intento: falló el envío (STARTTLS).
   - Segundo intento, después de habilitar STARTTLS en Mailpit: `retry_failed_only`, estado `SENT`.

Las operaciones de las 18:30 y las 19:00 **no** se movieron: habrían fabricado ausencias de turnos que todavía no ocurrieron.

**Resultado.** Correo real "Reporte diario de asistencia 2026-10-24 — Dinamic Demo":
- 8 jornadas, 5 presentes, 2 ausencias, 1 justificada, 1 tardanza, 2 sin llegada, 4 sin salida y 11 incidencias;
- XLSX adjunto con las hojas Resumen, Jornadas, Incidencias y Servicios.

Se guardaron el `.eml` y el `.xlsx` en `presentation-production/`.

- **D-06.** El reporte figura con fecha 24/10, mientras que las capturas del día muestran 25/10.
