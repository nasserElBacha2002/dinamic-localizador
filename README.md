# Dinamic Attendance

Sistema interno de **Dinamic Systems** para registrar y validar la asistencia de empleados cuando llegan a una tienda a realizar un inventario físico.

---

## Descripción

**Dinamic Attendance** permite a los administradores planificar inventarios en distintas tiendas, asignar empleados y recibir confirmaciones de llegada a través de **WhatsApp**. El empleado envía un mensaje y comparte su ubicación; el sistema valida horario, asignación y distancia respecto de la tienda, y deja el resultado disponible en un panel administrativo.

La integración con WhatsApp se realiza mediante **Twilio**. El bot **no** realiza seguimiento permanente de la ubicación: solo almacena la coordenada enviada voluntariamente al momento del check-in.

---

## Problemática

Actualmente necesitamos mejorar el seguimiento de asistencia de los empleados que trabajan en inventarios físicos en distintas tiendas.

Cada inventario debe contemplar:

| Concepto | Descripción |
|----------|-------------|
| Tienda asociada | Punto de referencia geográfico del inventario |
| Fecha y horario | Ventana en la que el empleado puede registrar llegada |
| Empleados asignados | Una o más personas habilitadas para el inventario |
| Radio permitido | Distancia máxima en metros respecto de la tienda |
| Franja horaria válida | Rango horario aceptado para el check-in |

Cada tienda registra:

- nombre
- dirección
- latitud y longitud
- radio permitido en metros

Cuando un empleado llega a la tienda, envía un mensaje al número de WhatsApp de la empresa y comparte su ubicación actual. El sistema identifica al empleado, valida el inventario asignado, calcula la distancia con la fórmula de **Haversine** y registra el resultado.

---

## Objetivo

Ofrecer un flujo simple y auditable para confirmar que un empleado asignado llegó a la tienda correcta, dentro del horario y del radio geográfico configurados, sin depender de una aplicación móvil propia ni de seguimiento continuo de ubicación.

---

## Flujo de funcionamiento

### Flujo general del sistema

```text
Administrador crea una tienda
→ registra empleados
→ crea un inventario
→ asigna empleados al inventario
→ el empleado llega a la tienda
→ envía "Llegué" por WhatsApp
→ el bot solicita la ubicación
→ el empleado comparte su ubicación actual
→ el backend valida horario y distancia
→ se registra la asistencia
→ el empleado recibe una confirmación
→ el administrador visualiza el resultado
```

### Ejemplo de conversación por WhatsApp

```text
Empleado:  Llegué
Bot:       Hola, Juan. Para registrar tu llegada al inventario de
           Tienda Centro (15/06/2026), compartí tu ubicación actual
           usando el botón de ubicación de WhatsApp.
Empleado:  [comparte ubicación]
Bot:       ✅ Check-in registrado correctamente.

           Tienda: Tienda Centro
           Hora registrada: 08:57
           Distancia detectada: 42 m
           Estado: Dentro del horario permitido
```

**Caso rechazado (fuera de radio):**

```text
Empleado:  [comparte ubicación]
Bot:       ⚠️ No pudimos validar tu llegada: estás a 380 m de la
           tienda (máximo permitido: 150 m). El registro quedó
           pendiente de revisión. Contactá a tu supervisor.
```

**Caso sin inventario activo:**

```text
Empleado:  Llegué
Bot:       No encontramos un inventario asignado para vos en la
           fecha y horario actuales. Verificá con administración.
```

### Diagrama del flujo técnico

```mermaid
sequenceDiagram
    participant E as Empleado
    participant W as WhatsApp
    participant T as Twilio
    participant B as Backend
    participant DB as SQL Server
    participant A as Panel Admin

    E->>W: "Llegué"
    W->>T: Mensaje entrante
    T->>B: Webhook HTTPS
    B->>DB: Buscar empleado e inventario
    DB-->>B: Datos encontrados
    B-->>T: Respuesta TwiML
    T-->>W: Solicitud de ubicación
    W-->>E: Mensaje del bot

    E->>W: Compartir ubicación
    W->>T: Mensaje con coordenadas
    T->>B: Webhook con latitud y longitud
    B->>B: Validar horario y distancia
    B->>DB: Registrar asistencia
    B-->>T: Confirmación
    T-->>W: Resultado del check-in
    W-->>E: Mensaje de confirmación

    A->>B: Consultar asistencias
    B->>DB: Buscar registros
    DB-->>B: Resultados
    B-->>A: Datos del panel
```

---

## Arquitectura

Arquitectura **monolítica simple**. No se prevén microservicios en la primera versión.

```text
Empleado
   ↓
WhatsApp
   ↓
Twilio
   ↓
Webhook HTTPS
   ↓
Backend Node.js + Express
   ↓
SQL Server

Administrador
   ↓
Frontend React + Vite
   ↓
Backend Node.js + Express
```

El frontend nunca accede directamente a SQL Server; siempre consulta y actualiza datos a través del backend.

| Capa | Responsabilidad |
|------|-----------------|
| WhatsApp / Twilio | Canal de mensajería y recepción de ubicación |
| Backend | Validaciones, webhooks, API REST, autenticación |
| SQL Server | Persistencia de entidades y registros |
| Frontend | Panel administrativo, mapas y consultas |

---

## Stack tecnológico

### Frontend

| Tecnología | Uso |
|------------|-----|
| React | Interfaz de usuario |
| Vite | Build y desarrollo |
| TypeScript | Tipado estático |
| React Router | Navegación |
| TanStack Query | Estado remoto y caché |
| React Hook Form | Formularios |
| Zod | Validación de esquemas |
| Material UI | Componentes visuales |
| Leaflet | Visualización de mapas |

### Backend

| Tecnología | Uso |
|------------|-----|
| Node.js | Runtime |
| Express | API REST |
| TypeScript | Tipado estático |
| JWT | Autenticación del panel |
| Twilio SDK | Mensajería WhatsApp |
| Haversine | Cálculo de distancia geográfica |

### Base de datos

| Tecnología | Uso |
|------------|-----|
| SQL Server | Almacenamiento relacional |

Entidades mínimas previstas:

- usuarios administrativos
- empleados
- tiendas
- inventarios
- empleados asignados a inventarios
- registros de asistencia
- mensajes recibidos y enviados por WhatsApp
- revisiones manuales
- sesiones temporales del bot

### WhatsApp (Twilio)

- Twilio Programmable Messaging
- Webhooks para mensajes entrantes
- Recepción de coordenadas de ubicación
- Respuestas automáticas
- Validación de firma `X-Twilio-Signature`

### Infraestructura

| Componente | Uso |
|------------|-----|
| Ubuntu | Servidor de producción |
| Docker | Contenedorización |
| Docker Compose | Orquestación local y despliegue |
| Nginx | Proxy reverso |
| Let's Encrypt | Certificados HTTPS |
| SQL Server | Contenedor o instancia externa |

---

## Funcionalidades del MVP

### Empleados

- Crear, editar y activar o desactivar empleados
- Asociar número de teléfono de WhatsApp

### Tiendas

- Crear y editar tiendas
- Cargar dirección, coordenadas y radio permitido

### Inventarios

- Crear inventarios y asociar una tienda
- Definir fecha, horario y tolerancias
- Asignar empleados
- Cambiar estado del inventario

### Asistencia (vía WhatsApp)

1. Identificar al empleado por su número de WhatsApp
2. Buscar el inventario asignado
3. Verificar fecha y horario actual
4. Recibir latitud y longitud desde WhatsApp
5. Calcular distancia entre empleado y tienda
6. Verificar si está dentro del radio permitido
7. Registrar el resultado
8. Informar si el check-in fue validado, rechazado o enviado a revisión
9. Evitar registros duplicados

### Panel administrativo

- Visualizar inventarios y empleados asignados
- Consultar asistencias con filtros por fecha, tienda y empleado
- Ver distancia detectada y estado del registro
- Revisar manualmente casos rechazados
- Visualizar la ubicación en mapa (Leaflet)

---

## Reglas de validación

Un check-in se considera **válido** cuando se cumplen **todas** estas condiciones:

```text
el teléfono pertenece a un empleado activo
AND el empleado está asignado al inventario
AND el inventario se encuentra dentro de la fecha válida
AND la ubicación fue enviada correctamente
AND la distancia es menor o igual al radio permitido
AND el horario está dentro de la ventana configurada
AND no existe un check-in previo
```

### Zona horaria

Los timestamps deben almacenarse de manera consistente, preferentemente en UTC. Para mostrar y validar horarios del MVP se utilizará la zona horaria `America/Argentina/Buenos_Aires`; el backend será la fuente de verdad para las validaciones horarias.

### Inventarios compatibles (ambigüedad)

```text
Si existe un único inventario compatible:
→ continuar el check-in.

Si existen varios inventarios compatibles:
→ pedir al empleado que seleccione la tienda o inventario.

Si no existe ninguno:
→ informar que no tiene un inventario activo.
```

### Cálculo de distancia

La distancia **no** se valida comparando coordenadas exactas. Se calcula en **metros** entre:

- las coordenadas de la tienda (latitud / longitud registradas), y
- las coordenadas recibidas desde WhatsApp.

Se utiliza la **fórmula de Haversine** sobre la superficie terrestre.

### Prevención de duplicados

Cada mensaje de Twilio incluye un `MessageSid` único. El sistema lo utiliza para evitar procesar dos veces el mismo evento y registrar check-ins duplicados.

---

## Estados del sistema

### Inventarios

| Estado | Descripción |
|--------|-------------|
| `SCHEDULED` | Planificado, aún no iniciado |
| `IN_PROGRESS` | En curso según fecha/horario |
| `COMPLETED` | Finalizado |
| `CANCELLED` | Cancelado |

### Asistencias

Para evitar que toda la evaluación dependa de un único estado, el resultado se descompone en tres campos independientes:

#### `validation_status`
| Estado | Descripción |
|--------|-------------|
| `VALID` | Check-in válido |
| `PENDING_REVIEW` | Requiere revisión manual |
| `REJECTED` | Check-in rechazado |

#### `location_status`
| Estado | Descripción |
|--------|-------------|
| `INSIDE_GEOFENCE` | Ubicación dentro del radio permitido |
| `OUTSIDE_GEOFENCE` | Ubicación fuera del radio permitido |
| `INVALID_LOCATION` | Ubicación no recibida o inválida |

#### `punctuality_status`
| Estado | Descripción |
|--------|-------------|
| `EARLY` | Check-in antes del horario esperado (si aplica) |
| `ON_TIME` | Check-in dentro de la ventana horaria configurada |
| `LATE` | Check-in dentro de tolerancia de llegada tardía |
| `OUTSIDE_TIME_WINDOW` | Fuera de la franja horaria configurada |

Errores operativos (no determinan ubicación/puntualidad):
| Estado | Descripción |
|--------|-------------|
| `ALREADY_REGISTERED` | Ya existía un check-in para ese inventario |
| `NO_ACTIVE_INVENTORY` | Sin inventario asignado en fecha/horario actual |

Esta separación permite, por ejemplo, identificar que una persona estaba en la tienda correcta pero llegó tarde.

---

## Modelo de datos general

Relaciones principales (conceptual):

```text
Usuario (admin)
Empleado ──< AsignaciónInventario >── Inventario ──> Tienda
Empleado ──< RegistroAsistencia >── Inventario
RegistroAsistencia ──> RevisiónManual (opcional)
MensajeWhatsApp ──> Empleado / SesiónBot
SesiónBot ──> Empleado (estado conversacional temporal)
```

| Entidad | Campos relevantes (referencia) |
|---------|--------------------------------|
| **Tienda** | nombre, dirección, latitud, longitud, radio (m) |
| **Empleado** | nombre, teléfono WhatsApp, activo |
| **Inventario** | tienda, fecha, hora inicio/fin, tolerancias, estado |
| **Asignación** | inventario, empleado |
| **Asistencia** | empleado, inventario, lat/lng, distancia (m), estado, timestamp |
| **Mensaje WhatsApp** | MessageSid, dirección, contenido, tipo, timestamp |
| **Revisión manual** | asistencia, usuario admin, decisión, notas |
| **Sesión bot** | empleado, paso actual, expiración |

> Los nombres de tablas, columnas y relaciones pueden ajustarse durante el desarrollo.

---

## Seguridad

- **Firma Twilio:** validar `X-Twilio-Signature` en cada webhook entrante
- **Autenticación JWT** para el panel administrativo
- **Contraseñas** almacenadas con hash (nunca en texto plano)
- **Variables sensibles** en archivo `.env` (no versionado)
- **HTTPS obligatorio** en producción
- **Validación de entrada** en API y formularios (Zod en frontend, validación en backend)
- **Control de acceso por roles** (administrador / operador según se defina)
- **Idempotencia** mediante `MessageSid` de Twilio
- **Auditoría** de modificaciones manuales en revisiones

### Auditoría mínima (requisitos)

Como mínimo, se registrará:

- fecha de creación y modificación;
- usuario que creó o modificó un inventario;
- usuario que revisó una asistencia;
- estado anterior y estado nuevo;
- motivo obligatorio de modificación manual;
- fecha y hora de la revisión.

No se diseñará todavía un sistema complejo de eventos; estos campos documentan el rastro mínimo requerido.

---

## Privacidad

- La **ubicación es un dato personal**
- Solo se solicita **durante el check-in**; no hay seguimiento en segundo plano
- Se almacena **únicamente** la ubicación enviada voluntariamente por el empleado
- El empleado debe conocer la **finalidad** del registro (confirmación de llegada al inventario)
- Los datos se conservan solo durante el **período necesario** para operación y auditoría

> La validación geográfica representa una evidencia operativa de ubicación, pero no constituye una garantía absoluta de presencia física. Los casos cercanos al límite del radio permitido podrán enviarse a revisión manual.

---

## Variables de entorno

Variables utilizadas en la base funcional actual:

```env
# Servidor
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
TZ=America/Argentina/Buenos_Aires

# Base de datos (host local con Docker: DB_PORT=14330)
DB_HOST=localhost
DB_PORT=14330
DB_NAME=dinamic_attendance
DB_USER=sa
DB_PASSWORD=
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

# Frontend (Vite)
VITE_API_URL=http://localhost:3000/api
VITE_GOOGLE_MAPS_API_KEY=

# Autenticación del panel
JWT_SECRET=change-this-secret-in-production-min-16-chars
JWT_EXPIRES_IN=8h
```

`APP_BASE_URL` se documenta en `.env.example` raíz para uso futuro; el backend actual no la consume.

### CORS

En desarrollo y producción, el backend acepta solo orígenes listados en `CORS_ALLOWED_ORIGINS` (siempre incluye `FRONTEND_URL`). No se usa `origin: "*"`.

### Arranque del backend

Si la conexión inicial a SQL Server falla, el proceso termina con código `1` (fail-fast). Docker reinicia el contenedor según su política.

Copiar los ejemplos antes de ejecutar:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

> **Nota:** No subir archivos `.env` al repositorio.

---

## Instalación local

### Desarrollo sin Docker

Instalar dependencias en raíz, backend y frontend:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

Luego iniciar frontend y backend en paralelo:

```bash
npm run dev
```

Comandos útiles adicionales:

```bash
npm run build
npm run lint
npm run migrate
npm run migrate:status
```

También se puede iniciar por separado:

```bash
npm run dev:backend
npm run dev:frontend
```

### Requisitos previos

- Node.js 20+
- npm
- SQL Server (contenedor Docker recomendado para esta etapa)

---

## Migraciones de base de datos

Las migraciones SQL viven en `database/migrations/` y se aplican en orden alfabético:

```text
001_initial_schema.sql
002_core_domain.sql
003_whatsapp_bot_flow.sql
004_mvp_completion.sql
```

### Primer administrador

Tras aplicar migraciones, crear el usuario inicial:

```bash
ADMIN_NAME="Administrador" \
ADMIN_EMAIL="admin@dinamicsystems.com" \
ADMIN_PASSWORD="cambiar-esta-clave" \
npm run admin:create
```

Luego iniciar sesión en `/login` con esas credenciales. Cambiá la contraseña inicial en entornos reales.

### Google Maps (tiendas)

Configurá `VITE_GOOGLE_MAPS_API_KEY` en `frontend/.env`. En Google Cloud habilitá **Maps JavaScript API** y **Places API**, restringí la clave por HTTP referrer y limitá las APIs habilitadas. Si la clave no está disponible, el formulario de tiendas permite ingreso manual de dirección y coordenadas.

El control de versiones usa la tabla `system_migrations`, que registra cada archivo aplicado con su nombre y `executed_at` en UTC.

### Runner

El único responsable de registrar migraciones es:

```text
backend/src/database/run-migrations.ts
```

Flujo del runner:

1. Verifica si la migración ya está en `system_migrations`.
2. Ejecuta el archivo SQL por lotes (`GO`).
3. Inserta el registro en `system_migrations`.

Los archivos `.sql` no deben insertar su propio registro en `system_migrations`.

### Ejecución manual

Desde la raíz:

```bash
npm run migrate
npm run migrate:status
```

Desde `backend/`:

```bash
npm run migrate
npm run migrate:status
```

La segunda ejecución de `npm run migrate` debe finalizar sin errores (idempotente).

### Docker

Al ejecutar:

```bash
docker compose up -d --build
```

el flujo es:

1. `sqlserver` inicia y pasa healthcheck.
2. `db-init` crea la base `dinamic_attendance` y tablas técnicas.
3. `migrations` ejecuta `npm run migrate` y termina con código `0`.
4. `backend` inicia solo si `migrations` finalizó correctamente.

Variable opcional para el runner en contenedor:

```env
MIGRATIONS_DIR=/database/migrations
```

### Verificación

```bash
npm run migrate:status
curl http://localhost:3000/api/health/database
```

---

## Ejecución con Docker

```bash
docker compose up -d --build
```

El proyecto Compose se llama `dinamic-attendance` (definido en `docker-compose.yml`).

Servicios definidos en `docker-compose.yml`:

| Servicio | Descripción |
|----------|-------------|
| `sqlserver` | SQL Server 2022 para desarrollo |
| `db-init` | Inicialización de base `dinamic_attendance` y tablas técnicas |
| `migrations` | Aplica migraciones con el runner de Node.js |
| `backend` | API Node.js + Express + TypeScript |
| `frontend` | Aplicación React + Vite + TypeScript |

### URLs de desarrollo

```text
Frontend: http://localhost:5173
Backend: http://localhost:3000
Health: http://localhost:3000/api/health
Database health: http://localhost:3000/api/health/database
```

---

## Panel administrativo (frontend)

### Rutas disponibles

| Ruta | Descripción |
|------|-------------|
| `/` | Inicio con estado del sistema y accesos rápidos |
| `/employees` | Listado de empleados |
| `/employees/new` | Alta de empleado |
| `/employees/:id` | Edición de empleado |
| `/stores` | Listado de tiendas |
| `/stores/new` | Alta de tienda |
| `/stores/:id` | Edición de tienda |
| `/inventories` | Listado de inventarios |
| `/inventories/new` | Alta de inventario |
| `/inventories/:id` | Detalle, asignaciones y edición |
| `/attendance` | Listado de asistencias |
| `/attendance/new` | Registro manual temporal de prueba |
| `/attendance/:id` | Detalle de asistencia |

### Funcionalidades implementadas

- CRUD administrativo de empleados, tiendas e inventarios
- Asignación y desasignación de empleados en inventarios
- Listado y detalle de asistencias con filtros
- Formularios con React Hook Form + Zod
- Paginación y filtros alineados con la API REST
- Layout administrativo responsive con Material UI
- Estado de salud del backend y base de datos en la página de inicio

### Variables de entorno del frontend

Archivo `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

### Comandos del frontend

```bash
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend run build
npm run lint
```

### Ejemplos HTTP

Ver `docs/api-examples.http` para probar la API con REST Client (VS Code / Cursor).

### Registro manual de asistencia (temporal)

La ruta `/attendance/new` expone un formulario interno que consume `POST /api/attendance`. Está pensado únicamente para validar el modelo de datos antes de integrar WhatsApp y Twilio. **No es funcionalidad productiva.**

### Pendiente en frontend

- Autenticación JWT real y rutas protegidas
- Integración Twilio / WhatsApp
- Mapas (Leaflet) y visualización geográfica
- Revisión manual avanzada de asistencias
- Roles, notificaciones y dashboard analítico

### Diferencias detectadas con la API real

| Aspecto | Diseño original | API real |
|---------|-----------------|----------|
| Conteo de asistencias en inventario | `attendanceCount` | `attendanceRecordsCount` en detalle |
| Conteo de asignados en listado | `assignedEmployeesCount` | No expuesto en `GET /inventories` |
| Resumen de tienda en listados | `Store` completo | `store` con `id`, `name`, `address`, `active` |
| Resumen de empleado en asistencias | `Employee` completo | `employee` con `id`, `name`, `phoneNumber` |
| Cancelar inventario | DELETE semántico | `DELETE /inventories/:id` cambia estado a `CANCELLED` |
| Desactivar empleado/tienda | DELETE | Baja lógica (`active = false`) |

---

## Integración con Twilio

### Configuración general

1. Crear cuenta en [Twilio](https://www.twilio.com/)
2. Habilitar **WhatsApp Sandbox** (desarrollo) o número aprobado (producción)
3. Asociar tu número personal al sandbox siguiendo las instrucciones de Twilio
4. Registrar empleados con el mismo teléfono E.164 que Twilio envía en `From` (ej. `+5491112345678`)
5. Configurar el webhook de mensajes entrantes:

   ```text
   POST https://<tu-dominio-publico>/api/webhooks/twilio/whatsapp
   ```

6. Exponer la URL con HTTPS (ngrok, Cloudflare Tunnel, etc. en desarrollo)
7. Completar variables de entorno en `backend/.env`:

   ```env
   TWILIO_ACCOUNT_SID=
   TWILIO_AUTH_TOKEN=
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   TWILIO_WEBHOOK_URL=https://<tu-dominio-publico>/api/webhooks/twilio/whatsapp
   TWILIO_VALIDATE_SIGNATURE=true
   ```

   En desarrollo local puede desactivarse la firma:

   ```env
   TWILIO_VALIDATE_SIGNATURE=false
   ```

   **No desactivar la firma en producción.**

### Flujo conversacional implementado

```text
Empleado envía "Llegué"
→ Twilio llama al webhook
→ el backend identifica al empleado
→ busca inventarios compatibles
→ solicita ubicación
→ el empleado comparte ubicación
→ valida asignación, horario y distancia (Haversine)
→ registra asistencia
→ responde con TwiML
```

### Webhook entrante

Endpoint: `POST /api/webhooks/twilio/whatsapp`

El backend:

1. Valida `X-Twilio-Signature` con `twilio.validateRequest(...)` usando **exactamente** `TWILIO_WEBHOOK_URL`
2. Parsea `application/x-www-form-urlencoded` con `express.urlencoded({ extended: false })`
3. Garantiza idempotencia por `MessageSid`
4. Persiste mensajes en `whatsapp_messages`
5. Gestiona sesiones en `bot_sessions`
6. Responde con `Content-Type: text/xml` (TwiML)

### Validación de firma Twilio

Requisitos:

- `TWILIO_WEBHOOK_URL` debe coincidir **carácter por carácter** con la URL configurada en Twilio Console (sin slash final adicional).
- Twilio envía `Content-Type: application/x-www-form-urlencoded`.
- La firma depende de **URL pública + parámetros POST + Auth Token** de la misma subcuenta.
- Usar `TWILIO_AUTH_TOKEN` (Auth Token de la cuenta/subcuenta). **No** usar API Key Secret.
- En producción: `TWILIO_VALIDATE_SIGNATURE=true`, URL HTTPS y sin `localhost`.
- Tras cambiar `.env`, recrear el contenedor backend en producción.

Diagnóstico local (sin imprimir secretos):

```bash
TWILIO_AUTH_TOKEN=*** \
npm run twilio:signature:verify -- \
  --url=https://<tu-dominio-publico>/api/webhooks/twilio/whatsapp \
  --signature=<X-Twilio-Signature> \
  --params='MessageSid=...&From=...&To=...&Body=...'
```

Si el webhook responde `403`:

| Código | Significado probable |
|--------|-------------------|
| `TWILIO_SIGNATURE_CONFIG_MISSING` | Falta header, token o URL en el entorno |
| `TWILIO_SIGNATURE_INVALID` | URL distinta a Twilio, body alterado, token incorrecto o parser incorrecto |

Revisar en Twilio Console → Monitor → Logs → Request Inspector:

- URL solicitada por Twilio
- Headers (`X-Twilio-Signature`)
- Body form-urlencoded recibido
- Respuesta HTTP del servidor

No configurar el fallback de Twilio apuntando al mismo webhook principal.

### Prueba local con REST Client

Ver ejemplos en `docs/api-examples.http` (sección WhatsApp). Requieren:

```env
TWILIO_VALIDATE_SIGNATURE=false
```

### Sesiones conversacionales

Duración configurable con:

```env
BOT_SESSION_TTL_MINUTES=15
```

Reglas actuales:

- `expires_at` se calcula en UTC al crear la sesión: `now UTC + BOT_SESSION_TTL_MINUTES`.
- Una sesión es activa solo si `state` es `WAITING_LOCATION` o `WAITING_INVENTORY_SELECTION` y `expires_at > SYSUTCDATETIME()`.
- No existe cron en esta fase: la expiración es **perezosa** al consultar la sesión.
- Si la sesión ya venció, se marca `EXPIRED`, no se devuelve como activa y no se reactiva.
- Al seleccionar un inventario válido (`WAITING_INVENTORY_SELECTION` → `WAITING_LOCATION`) se renueva `expires_at`.
- Mensajes inválidos, saludos o texto durante `WAITING_LOCATION` **no** renuevan el TTL.
- Al iniciar un nuevo "Llegué", las sesiones vigentes previas pasan a `CANCELLED` y las vencidas pero aún activas por estado pasan a `EXPIRED`.
- Solo puede existir una sesión activa por empleado (índice único filtrado en SQL Server).

Mensaje al usuario cuando la sesión venció:

```text
La solicitud anterior venció.
Escribí "Llegué" para comenzar nuevamente.
```

#### Probar vencimiento en desarrollo

1. Enviar "Llegué" por webhook.
2. Forzar vencimiento en SQL Server:

```sql
UPDATE bot_sessions
SET expires_at = DATEADD(MINUTE, -1, SYSUTCDATETIME())
WHERE phone_number = '+5491112345678'
  AND state IN ('WAITING_LOCATION', 'WAITING_INVENTORY_SELECTION');
```

3. Enviar ubicación o selección: debe responder con el mensaje de vencimiento.
4. Enviar "Llegué" nuevamente: debe crear una sesión nueva.

`BOT_OPERATION_TIMEZONE` se usa solo para mostrar horarios al usuario, no para expirar sesiones.

### Reglas horarias del bot

Ventana compatible para inventario:

```text
scheduled_start - early_tolerance_minutes
hasta scheduled_start + late_tolerance_minutes
```

Clasificación de puntualidad al recibir ubicación:

| Estado | Regla |
|--------|-------|
| `EARLY` | Antes de `scheduled_start`, dentro de tolerancia previa |
| `ON_TIME` | Desde `scheduled_start` hasta `scheduled_start + BOT_ON_TIME_GRACE_MINUTES` (default 15 min) |
| `LATE` | Después del margen de puntualidad, dentro de tolerancia tardía |
| `OUTSIDE_TIME_WINDOW` | Fuera de la ventana total |

### Tipos de mensaje relevantes

| Tipo | Acción del sistema |
|------|-------------------|
| Texto ("Llegué", etc.) | Iniciar o continuar flujo de check-in |
| Ubicación | Validar distancia y registrar asistencia |
| Otros | Respuesta genérica o ignorar según política |

---

## Estructura del proyecto

Estructura sugerida (puede variar):

```text
dinamic-attendance/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── attendance/
│   │   │   ├── geolocation/
│   │   │   └── twilio/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── docker/
│   └── nginx/
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Roadmap

| Fase | Alcance |
|------|---------|
| **MVP (v1)** | CRUD de tiendas, empleados e inventarios; check-in por WhatsApp; panel admin; validación Haversine; estados de asistencia |
| **v1.1** | Revisión manual mejorada, exportación de reportes, notificaciones a supervisores |
| **v1.2** | Check-out opcional, métricas de puntualidad por tienda |
| **Futuro** | Integraciones adicionales, app móvil, analítica avanzada (fuera del MVP) |

---

## Alcance no incluido

El MVP **no** incluye:

- Aplicación móvil propia
- Ubicación en tiempo real
- Seguimiento permanente de ubicación
- Reconocimiento facial
- Liquidación de sueldos
- Control biométrico
- Inteligencia artificial
- Microservicios
- Check-out (salvo que se incorpore en una fase posterior)

---

## Licencia

Proyecto de uso interno de **Dinamic Systems**. Todos los derechos reservados.

Consultar con el equipo legal o de gestión antes de distribuir, publicar o reutilizar este código fuera de la organización.

---

> **Nota de desarrollo:** Los nombres de variables de entorno, scripts npm, carpetas y convenciones de código pueden modificarse durante la implementación. Este documento describe el alcance y diseño previstos para la primera versión.
