# 33 — Handoff final de producción (v2)

## Respuestas

| Pregunta | Respuesta |
|---|---|
| ¿Demo lista? | **Parcialmente.** Las capturas alcanzan para armar las 18 slides; faltan los videos, los chats reales y el mapa |
| Slides listas | 01, 02, 04, 05, 06 (still), 07 (still), 08 (still), 09, 10, 11 (stills web), 12 (still), 13, 14, 15–18 y anexos |
| Slides bloqueadas | Ninguna por completo. La 03 queda sin mapa (usar SS-05) |
| Screenshots READY | SS-01, 02, 03, 04, 05, 07, 08, 09, 10, 10B (serie), 11, 12, 13 (serie), 13B, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 28 |
| Screenshots NEEDS_EDIT | SS-22 (ensanchar columna en Excel), SS-27 (recorte) |
| Screenshots BLOCKED | SS-06 |
| Videos READY | Ninguno |
| WhatsApp real | **No.** Webhook local; nada se entregó por WhatsApp |
| Reporte real | **Sí.** Pipeline oficial, entregado por SMTP a un buzón de prueba local (Mailpit), con el XLSX real adjunto. No llegó a una casilla externa |
| Mapa real | **No** (`32`) |
| B-01 | **FIXED** (`34`) |
| B-02 | **FIXED** (`34`), incluida la regresión de parámetros del propio fix |

## Antes de presentar

1. Grabar los videos con una persona (`19`). VIDEO-07 tiene a Bruno pendiente; no aprobarlo antes de grabar.
2. Para la slide 11 usar la serie SS-10B y decir "el sistema propone candidatos y el responsable cubre". No afirmar que la elección por WhatsApp está probada.
3. Slide 13: el correo es del 24/10 porque las operaciones de la tarde se corrieron un día para poder emitir el reporte D−1 (`28`). Recortar la fecha o asumirla en el guion.
4. Slide 14: los datos son de un solo día; no hablar de tendencias.
5. SS-06: destrabar según `32` o dejar la slide 03 con SS-05.

## Entorno local que queda corriendo

- Backend en 3004 (`npm run dev`) con variables de proceso: `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1026`, `SMTP_SECURE=false`, `SMTP_FROM=reportes@demo.dinamic.test`, `TWILIO_WHATSAPP_NUMBER=whatsapp:+10000000000` y `NODE_TLS_REJECT_UNAUTHORIZED=0`. Esta última es solo para aceptar el certificado autofirmado de Mailpit, porque el servicio exige STARTTLS con `SMTP_SECURE=false`. **No usar fuera de local.** Log en `/tmp/demo-backend.log`.
- Frontend `vite preview` en 8084.
- Mailpit en el contenedor `dinamic-demo-mailpit`: SMTP en `127.0.0.1:1026` con STARTTLS autofirmado y UI en `http://127.0.0.1:8026`. Tiene un mensaje.
- Login de capturas: Valeria Gómez (`@demo.dinamic.test`). La contraseña no está en ningún archivo.
- Estado de datos:
  - **24/10:** Hotel Central — Palermo y Clínica Norte 17:00, más la ausencia de Nina (corridas un día).
  - **25/10:** Clínica Norte 18:30 (Hugo válido, Bruno pendiente) y Torre Corporativa 19:00 (Diego no disponible, Sofía cubre).
  - Las capturas SS-01 a SS-20 se tomaron **antes** del corrimiento y muestran todo en el 25/10.

## Cambios hechos

- **Código (local, sin commit):** B-01, B-02 (+ regresión), fecha de incidencias y test de migración de alertas. Detalle en `34`.
- **Base local (demo):**
  - `CK_waan_*` reaplicados con el DDL de las migraciones 150 y 103.
  - Corrimiento de −1 día de las operaciones de las 17:00 (26 filas, una transacción, respaldo previo en `/tmp/demo-shift-backup.json`). Ver `28`.
- Sin cambios en `.env`, migraciones, dependencias ni producción.
