# PROJECT_CONTEXT — Dinamic Attendance / Localizador

> Generado por auditoría de reconstrucción de contexto (read-only sobre código de aplicación).  
> **Fuente de verdad:** código + migraciones vigentes. Donde README/docs divergen, se documenta la discrepancia.  
> Fecha de inspección: 2026-08-27 · Rama: `DIN-330` @ `fb8994f`

---

### 1. Resumen ejecutivo

**Dinamic Attendance** (repo `dinamic-localizador`) es un sistema multi-empresa de **asistencia geolocalizada** y operaciones de campo para Dinamic Systems. Los colaboradores confirman llegada (“Llegué”) y salida (“Terminé”) por **WhatsApp (Twilio)** con ubicación puntual (sin tracking continuo). El panel web permite planificar **servicios** (ubicaciones), **operaciones** (jornadas one-time/recurring), asignaciones, revisión de asistencias, ausencias, recibos de sueldo, estadísticas y observabilidad WhatsApp.

Arquitectura: **monolito Node.js/Express + React/Vite**, persistencia en **SQL Server**, jobs in-process con outbox/lease en DB (sin Redis/Bull). Estado general: **producto maduro en producción** (`develop` deploy vía SSH), con dominio renombrado (tienda/inventario → servicio/operación), multi-tenant por `company_id`, módulos por empresa, 2FA, y una suite de tests grande (~370 backend + ~165 frontend). El README raíz está **parcialmente desactualizado** (terminología MVP antigua, Material UI/Leaflet vs Mantine/Google Maps).

---

### 2. Stack tecnológico

| Capa | Tecnología | Evidencia |
|------|------------|-----------|
| Monorepo | npm workspaces-style (scripts raíz) | `package.json` |
| Backend runtime | Node `>=20.19.0`, TypeScript 5.9, Express 5 | `backend/package.json` |
| Backend libs | mssql, zod 4, jwt, bcrypt, luxon, twilio, helmet, morgan, multer/busboy, otpauth, nodemailer, `@google-cloud/storage`, xlsx | idem |
| Frontend | React 19, Vite 7, TypeScript, React Router 8, TanStack Query 5, Mantine 9, RHF + Zod, ECharts, axios | `frontend/package.json` (Node `>=22.22.0`) |
| DB | Microsoft SQL Server | `docker-compose.yml`, `mssql` |
| Auth | JWT Bearer + `tokenVersion`; TOTP 2FA; password reset; invitations | migraciones 097–099, `auth.service.ts` |
| Maps | Google Maps (Vite + backend geocoding keys) | `.env.example`, no Leaflet en deps |
| Object storage | Google Cloud Storage (ausencias / payroll) | `GCS_*`, `@google-cloud/storage` |
| Messaging | Twilio WhatsApp (webhooks + Content Templates) | `twilio.routes.ts`, env `TWILIO_*` |
| Email | SMTP / nodemailer | `email.service.ts` |
| Containers | Docker Compose dev + prod overlay | `docker-compose.yml`, `docker-compose.prod.yml` |
| CI/CD | GitHub Actions: PR validation, quality-gate, deploy backend/frontend | `.github/workflows/` |
| Lint | ESLint 10 + typescript-eslint | ambos packages |
| Tests | Node built-in test runner (`tsx --test`), happy-dom/jsdom en FE | scripts `test` / `test:integration` |
| Audit tooling | Python framework en `scripts/audit/` | root `npm run audit:*` |

**Discrepancia docs:** README lista Material UI + Leaflet; el código usa **Mantine** + **Google Maps**.

---

### 3. Arquitectura

```text
[Colaborador WhatsApp]
        │
     Twilio
        │ webhook HTTPS (+ signature)
        ▼
[Backend Express :3000]
  routes → middleware (auth/company/modules)
       → controllers → services → repositories → SQL Server
  jobs in-process (reminders, materialization, alerts, cleanup, …)
  GCS (adjuntos / recibos)
  SMTP (invites / password reset)
        ▲
[Panel React/Vite]
  AuthContext (JWT localStorage) + CompanyContext
  API client Axios → /api/...
```

- **Sin microservicios.** Un solo proceso API arranca HTTP + jobs (`backend/src/server.ts`).
- **Multi-tenant:** casi toda data operativa lleva `company_id`; rutas `/api/companies/:companyId/...` y alias legacy `/api/...` con company resuelta por membership/default.
- **Módulos por empresa:** `attendance`, `operations`, `absences`, `payroll_receipts`, `reports`, `bot_simulator` (`company_modules` + middleware `requireCompanyModule`).
- **WhatsApp:** resolución de empresa por teléfono → router de intenciones → flujos bot (check-in/checkout/ausencias/recibos/menú) → TwiML respuesta.
- **Colas:** tablas SQL + workers con lease/fencing (admin alerts, payroll notifications, absence sync, attendance alert evaluation). **No** hay Redis/Bull/Kafka.

---

### 4. Estructura del repositorio

| Path | Responsabilidad |
|------|-----------------|
| `backend/src/server.ts` | Entrypoint: DB connect, start/stop jobs, listen |
| `backend/src/app.ts` | Express app, cors, helmet, `/api` |
| `backend/src/routes/` | Routers HTTP (thin) |
| `backend/src/controllers/` | Adaptadores HTTP (p.ej. Twilio) |
| `backend/src/services/` | Lógica de negocio (~200+ módulos) |
| `backend/src/services/bot/` | Flujos check-in/checkout, geofence, menú, parsers |
| `backend/src/services/whatsapp-router/` | Dispatch de mensajes WhatsApp por sesión/intent |
| `backend/src/repositories/` | SQL parametrizado (aislamiento DB) |
| `backend/src/middleware/` | Auth, company context, modules, Twilio signature, rate limits |
| `backend/src/schemas/` | Zod request validation |
| `backend/src/jobs/` | Timers/workers in-process |
| `backend/src/domain/` | Políticas de dominio puras (ausencias, terminología) |
| `backend/src/config/env.ts` | Validación Zod de env (fail-fast) |
| `frontend/src/pages/` | Pantallas por dominio |
| `frontend/src/api/` | Clientes HTTP tipados |
| `frontend/src/routes/AppRoutes.tsx` | Routing + guards de módulo/permiso |
| `frontend/src/design-system/` | UI compartida (Mantine-based) |
| `frontend/src/context/` | Auth + Company |
| `database/migrations/` | SQL numerado 001–107 (+ rollbacks) |
| `database/init`, `seeds/` | Bootstrap / datos |
| `docs/` | Docs puntuales (GCS, lifecycle, observability) |
| `audit/`, `review/` | Artefactos de auditoría/revisión (no runtime) |
| `scripts/audit/` | Quality/security/architecture gates |
| `deploy/` | Nginx host template |
| `secrets/` | Montaje local de credenciales GCS (gitignored contents) |
| `.github/` | CI + scripts de deploy SSH |

**Flujo de capas típico:** `Route` → `validate(zod)` → `authenticate` / `resolveCompanyContext` / `requirePermission|Module` → `Service` → `Repository` → SQL.

---

### 5. Modelo de dominio

Conceptos centrales (producto actual):

| Concepto producto | Código / tabla física |
|-------------------|------------------------|
| Empresa (tenant) | `companies` |
| Usuario panel | `users` + `user_company_memberships` (roles OWNER/ADMIN/HR/SUPERVISOR/OPERATOR/READ_ONLY) |
| Colaborador | `employees` (phone E.164 por empresa) |
| Servicio (ubicación operativa) | `operational_locations` (alias API `Service`; vistas legacy `stores`) |
| Operación | `scheduled_operations` (ONE_TIME \| RECURRING; vistas legacy `inventories`) |
| Asignación | `operation_assignments` (+ confirmation PENDING/CONFIRMED/UNAVAILABLE) |
| Jornada / workday | `operation_workdays` + `employee_workdays` |
| Asistencia | `attendance_records` (+ reviews, checkout fields) |
| Equipos | `work_teams`, `work_team_members`, batches de asignación |
| Ausencias | `absence_requests`, balances, ledger, calendarios, adjuntos GCS |
| Recibos | `payroll_receipts` / batches + notificaciones WhatsApp |
| Bot session | `bot_sessions` (TTL configurable) |
| Observabilidad WA | `whatsapp_*` (messages, flows, provider events, conversations) |
| Alertas admin | outbox `whatsapp_admin_alert_notifications` + recipients |
| Zonas geográficas | `location_zones` (geocoding 106–107) |

Terminología dual documentada en `backend/src/types/operational-domain.ts` y `domain/terminology.ts`.

---

### 6. Modelo de datos

- **Migraciones:** ~109 archivos SQL en `database/migrations/`; runner `backend/src/database/run-migrations.ts` registra en `system_migrations`.
- **PK:** `UNIQUEIDENTIFIER` (NEWID) en entidades de negocio.
- **Tenant:** `company_id` en tablas operativas; FKs compuestas reforzadas en fases posteriores (087+).
- **Estados clave:**
  - Operación: `SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED`
  - Validación geo/asistencia: `VALID | PENDING_REVIEW | REJECTED`
  - Puntualidad: `EARLY | ON_TIME | LATE | OUTSIDE_TIME_WINDOW`
  - Location: `INSIDE_GEOFENCE | OUTSIDE_GEOFENCE | INVALID_LOCATION`
  - Checkout: ver `backend/src/constants/checkout-status.ts` / migración 007
  - Empresa: `ACTIVE | INACTIVE | SUSPENDED` (+ lifecycle deletion grace)
- **Soft delete:** no universal; deactivation flags (`employees.active`, memberships); company deletion con grace + purge job.
- **Timestamps:** `created_at` / `updated_at` UTC (`SYSUTCDATETIME`).
- **Auditoría:** `audit_logs` + servicios de audit; WhatsApp observability tables.
- **Índices importantes:** uniqueness MessageSid en attendance; phone per company; workday `(operation_id, work_date)`; outbox dedup constraints (103).
- **Compatibilidad legacy:** vistas `stores`, `inventories`, `inventory_employees` sobre tablas renombradas (021) — **no** usar vistas para DML nuevo.

---

### 7. Flujos principales

#### 7.1 Check-in WhatsApp (“Llegué”)

1. Twilio POST `/api/webhooks/twilio/whatsapp` (`twilio.routes.ts`).
2. Validación firma (`validate-twilio-signature`) según env.
3. Parse Zod body → `whatsappCompanyContextService.resolve` (empresa + empleado por teléfono).
4. Claim idempotente inbound MessageSid (`whatsappWebhookEventRepository`).
5. `whatsappBotService` → `whatsappRouterService.routeTextMessage` / location handlers.
6. Sesión bot (`BOT_SESSION_TTL_MINUTES`); selección de workday si hay múltiples.
7. Ubicación real requerida; rechazo de forwarded location (alert admin posible).
8. Geofence Haversine + radio servicio + `BOT_GEOFENCE_REVIEW_MARGIN_METERS` → VALID / PENDING_REVIEW / reject path.
9. Insert `attendance_records` transaccional; unique `source_message_sid`.
10. Respuesta TwiML al colaborador; panel lee vía API attendance.

#### 7.2 Check-out (“Terminé”)

1. Intent checkout → requiere check-in previo / attendance abierta.
2. Ubicación según `require_checkout_location` (company settings).
3. Early leave / overtime según tolerancias de workday/company.
4. Update checkout fields + `checkout_message_sid`.

#### 7.3 Panel: CRUD operaciones / servicios / empleados

1. Login JWT (+ 2FA challenge si habilitado).
2. `CompanyContext` selecciona tenant.
3. Rutas FE guardadas por módulo + permisos (`FeatureRouteGuard`, `entity-route-access`).
4. API `/api/companies/:companyId/...` con `resolveCompanyContext` + `requirePermission`.
5. Services escriben SQL scoped por `company_id`.

#### 7.4 Confirmación de asistencia / recordatorios

- Job `attendance-reminder.job` + Content Templates Twilio.
- Flujos de confirmación de asignación y reply durable (`attendance-confirmation-response.handler.ts`).
- Outbox `whatsapp_attendance_notifications` con estados incl. superseded (075).

#### 7.5 Ausencias

- Draft → request → review; impacto en workdays; sync job con lease fencing.
- Adjuntos GCS; cleanup job.
- Bot WhatsApp state machine de ausencias.

#### 7.6 Recibos de sueldo

- Upload batch → storage GCS → notification worker → WhatsApp template → query delivery tracking.

#### 7.7 Alertas admin (WhatsApp)

- Emit → outbox por recipient → `admin-alert.job` (flag `ADMIN_ALERT_WORKER_ENABLED`, default **false** en `.env.example`).
- Tipos: missing check-in, absence pending, attendance threshold, forwarded location, etc.

#### 7.8 Lifecycle empresa

- Soft schedule deletion → grace (`COMPANY_DELETION_GRACE_PERIOD_DAYS`) → purge job + pending storage deletions.

---

### 8. Autenticación y permisos

**Login**

- `POST /api/auth/login` → bcrypt password → JWT (`JWT_SECRET`, `JWT_EXPIRES_IN`).
- Payload incluye `userId`, role legacy, `tokenVersion`; invalidación al incrementar version (password reset / revoke).
- **2FA TOTP** opcional (`two-factor.service.ts`, recovery codes).
- Token en frontend: localStorage vía `AuthContext` (Bearer). **No** refresh-token cookie flow detectado.

**Autorización**

- Platform: `users.is_platform_admin` → rutas `/api/platform/*` (`require-platform-admin`).
- Company roles → permission sets en `company-permissions.ts` (OWNER/ADMIN/HR/SUPERVISOR/OPERATOR/READ_ONLY).
- Module gates independientes de rol fino.
- Twilio webhook: **sin JWT**; autenticado por firma Twilio (+ company resolve).

**Riesgos a vigilar (patrón del repo, no bug puntual verificado aquí)**

- Rutas duales company-scoped + alias legacy: todo query debe filtrar `company_id` (tests `company-isolation.integration.test.ts` existen).
- Permisos FE no sustituyen backend: backend aplica `requirePermission` en routers sensibles; al agregar endpoints nuevos, replicar ambos.
- Platform admin bypass de membership debe permanecer explícito y testeado.

---

### 9. Integraciones externas

| Proveedor | Propósito | Entrada/salida | Auth | Notas |
|-----------|-----------|----------------|------|-------|
| **Twilio WhatsApp** | Inbound bot, outbound templates, status callbacks | Webhook form → TwiML; REST outbound | Account SID/token; signature validation | Content SIDs en env; observabilidad |
| **Google Maps / Places** | UI mapas, geocoding zonas | API key FE/BE | API keys | `location-zone-geocoding.service.ts` |
| **Google Cloud Storage** | Adjuntos ausencias, recibos | Signed URLs / stream upload | Service account JSON | `secrets/`, `GCS_*` |
| **SMTP** | Invitaciones, password reset | Email | SMTP creds | nodemailer |
| **SQL Server** | Persistencia | TDS | DB users/roles `dinamic_app_runtime` / migrations | 089–090 |

No hay evidencia de Stripe, Redis, Kafka, AWS SDK en dependencias actuales.

---

### 10. Ejecución local

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# completar secrets: DB_PASSWORD, JWT_SECRET, TWILIO_*, 2FA keys, etc.

npm install && npm --prefix backend install && npm --prefix frontend install

# DB: Docker SQL Server recomendado
docker compose up -d sqlserver   # host map típico 1435→1433 (ver compose)

npm run migrate
ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create

npm run dev   # backend + frontend (FE Vite :8084; API :3000)
```

Alternativa full stack: `docker compose up -d --build` (sqlserver → db-init → migrations → backend → frontend).

Puertos típicos (`.env.example`): API `3000`, FE `8084` / host map `5173`, SQL external `14330` o compose `1435`.

---

### 11. Deployment e infraestructura

- **CI PR:** `.github/workflows/pr-validation.yml` valida `docker compose ... config`; quality-gate y tests en otros workflows.
- **Deploy:** push a `develop` → SSH (`appleboy/ssh-action`) a host; path default `/opt/dinamic-attendance/dinamic-localizador`; scripts `.github/scripts/deploy-backend.sh` / frontend.
- **Prod compose:** `docker-compose.prod.yml` overlay (migrations one-shot, backend, frontend nginx image).
- **Proxy:** `deploy/nginx.host.conf.template`; `trust proxy` en Express para Twilio.
- **Health:** `health.routes.ts` bajo `/api`.
- **Secrets:** GitHub Actions secrets + env en servidor; no commitear `.env`. GCS via mounted credentials.
- **Workers:** mismos procesos backend (flags `*_JOB_ENABLED` / `*_WORKER_ENABLED`).

Riesgo deploy: `git reset --hard origin/develop` en servidor (destruye cambios locales no pusheados en el host).

---

### 12. Testing

| Tipo | Ubicación | Escala aprox. |
|------|-----------|---------------|
| Unit / source guards | `backend/src/**/*.test.ts` | ~373 |
| Integration (DB) | `*.integration.test.ts`, `npm run test:integration` | ~84 |
| Frontend | `frontend/src/**/*.test.ts(x)` | ~165 |
| Audit framework | `scripts/audit/framework/tests` | Python unittest |

**Bien cubierto (evidencia por volumen de tests):** company isolation, Twilio signature, absence concurrency/lease, admin-alert outbox, WhatsApp observability authz, auth/2FA pieces, geofence/haversine, muchos flows bot.

**Huecos típicos a validar al tocar código:**

- Flujos E2E reales Twilio/WhatsApp (hay bot-simulator + integración, no E2E cloud Twilio).
- Race multi-instance jobs si se escala horizontalmente (>1 réplica backend) sin revisar leases.
- Regresión geofence/forwarded location y confirmaciones de asignación al cambiar router.

No hay reporte de cobertura % versionado en repo (no inventar métricas).

---

### 13. Riesgos y deuda técnica

#### CRITICAL

- **Dominio WhatsApp/asistencia es el corazón del negocio:** cambios en `whatsapp-router`, `bot/*`, `attendance.repository`, geofence o MessageSid idempotency pueden romper producción silenciosamente (incidentes documentados en `audit/whatsapp-*-audit.md`).
- **Firma Twilio / URL webhook:** mal configurada en prod (`TWILIO_VALIDATE_SIGNATURE`, `TWILIO_WEBHOOK_URL`) abre o bloquea el canal.

#### HIGH

- **README desalineado** (terminología inventario/tienda, MUI/Leaflet) → onboarding incorrecto y riesgos de diseño.
- **Archivos “god” grandes** (~700–950 LOC): `absence-request.service.ts`, `checkout-attendance.flow.ts`, `check-in-attendance.flow.ts`, `attendance.repository.ts`, `operation.service.ts` — alto acoplamiento / dificultad de review.
- **Workers default-off** (`ADMIN_ALERT_WORKER_ENABLED`, `OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED` false en example): features “implementadas” pueden estar inactivas en un entorno si no se activan conscientemente.
- **Multi-instance:** jobs in-process asumen lease fencing correcto; desplegar N réplicas sin revisar claims = doble envío.

#### MEDIUM

- Rutas API duales (con/sin `:companyId`) aumentan superficie de olvido de scoping.
- Vistas legacy `stores`/`inventories` pueden confundir queries ad-hoc.
- Observabilidad WhatsApp + phone hashing secrets deben permanecer consistentes (`WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET`).
- Frontend Node engine 22 vs backend 20 — CI usa 22; alinear entornos locales.

#### LOW

- Artefactos `implementation-*-diff.txt`, `audit/`, `review/` ensucian raíz (no afectan runtime).
- TODOs dispersos mínimos (no masivos).
- Duplicación conceptual Service/OperationalLocation naming en types.

---

### 14. Áreas sensibles

Antes de modificar, leer con cuidado:

1. `backend/src/services/whatsapp-router/**` + `backend/src/services/bot/**`
2. `backend/src/controllers/twilio-webhook.controller.ts` + `middleware/validate-twilio-signature.ts`
3. `backend/src/repositories/attendance.repository.ts` + `employee-workday-*.ts`
4. `backend/src/utils/haversine.ts` + `attendance-validation` / geofence
5. `backend/src/middleware/company-context.ts` + repositories con `company_id`
6. `backend/src/config/env.ts` (validaciones de producción)
7. Migraciones nuevas: estilo additive + rollbacks en `database/migrations/rollback/`
8. Jobs outbox: admin-alert, payroll, assignment notifications, absence sync
9. `frontend/src/routes/AppRoutes.tsx` + permission/module guards (mantener parity con backend)

---

### 15. Funcionalidades incompletas o ambiguas

- **Admin alert / assignment notification workers** gated off by default — confirmar estado real en producción.
- **Bot simulator** módulo opcional por company — no es canal productivo.
- **Dev reminder routes** (`/dev/attendance-reminders`) — solo con módulo attendance; verificar guardas de entorno.
- **Location proximity / zones geocoding** (migraciones 106–107, audits recientes) — feature reciente; validar completitud operativa.
- **README roadmap / “alcance no incluido”** puede no reflejar absences/payroll/observability ya shippeados.
- Rama actual `DIN-330` (WhatsApp router tweaks + tests) ya mergeada también hacia `main` según historial local — confirmar qué falta respecto a `develop`.

---

### 16. Mapa rápido para futuros agentes

> Si necesitás modificar **X**, empezá inspeccionando **A, B, C**.

| Si necesitás… | Empezá por… |
|---------------|-------------|
| Check-in / checkout WhatsApp | `whatsapp-router.service.ts` → `attendance.handler.ts` / `checkout.handler.ts` → `check-in-attendance.flow.ts` / `checkout-attendance.flow.ts` → `attendance.repository.ts` |
| Geofence / radios | `bot-geofence.validator.ts`, `utils/haversine.ts`, `company_settings`, env `BOT_*` |
| Nueva ruta API company-scoped | `routes/index.ts` + router del dominio + `requirePermission` + FE `api/` + `AppRoutes` |
| Multi-tenant / IDOR | `company-context.ts`, repository filters `company_id`, `company-isolation.integration.test.ts` |
| Módulos por empresa | `constants/company-modules.ts`, `require-company-module.ts`, FE `company-modules` utils |
| Ausencias | `absence-request.service.ts`, calendarios, `absence-workday-sync.job.ts`, docs GCS |
| Recibos | `payroll-receipt.service.ts`, notification job, GCS prefix payroll |
| Alertas admin | `admin-alert.service.ts`, outbox repo, `admin-alert.job.ts`, migration 100–104 |
| Auth / 2FA | `auth.service.ts`, `two-factor.service.ts`, middleware `authenticate.ts` |
| Operaciones recurring | `operation.service.ts`, `recurring-workday-materialization.job.ts`, migration 039+ |
| Deploy / env | `.env.example`, `docker-compose*.yml`, `.github/workflows/deploy-*.yml` |
| Renombres dominio | `021_physical_operational_table_rename.sql`, `operational-domain.ts`, `domain/terminology.ts` |

---

### 17. Preguntas abiertas

1. ¿En el servidor de producción están habilitados `ADMIN_ALERT_WORKER_ENABLED` y `OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED`?
2. ¿Cuántas réplicas del contenedor backend corren hoy (impacto en jobs)?
3. ¿El README se mantiene a propósito en terminología “inventario/tienda” para stakeholders, o debe actualizarse a servicio/operación?
4. ¿Existe un entorno staging separado de `develop` deploy, o develop = prod?
5. ¿Política actual sobre vistas legacy `stores`/`inventories` (fecha de drop)?

---

## Apéndice A — Jobs in-process

| Job | Archivo | Flag típico |
|-----|---------|-------------|
| Attendance reminders | `attendance-reminder.job.ts` | `ATTENDANCE_REMINDER_JOB_ENABLED` |
| Recurring workday materialization | `recurring-workday-materialization.job.ts` | `RECURRING_WORKDAY_MATERIALIZATION_JOB_ENABLED` |
| Absence workday sync | `absence-workday-sync.job.ts` | (service/lease) |
| Absence attachment cleanup | `absence-attachment-cleanup.job.ts` | `ABSENCE_ATTACHMENT_CLEANUP_JOB_ENABLED` |
| WhatsApp observability cleanup | `whatsapp-observability-cleanup.job.ts` | `WHATSAPP_OBSERVABILITY_CLEANUP_JOB_ENABLED` |
| Company deletion purge | `company-deletion.job.ts` | `COMPANY_DELETION_JOB_ENABLED` |
| Payroll receipt notifications | `payroll-receipt-notification.job.ts` | `PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED` |
| Operation assignment notifications | `operation-assignment-notification.job.ts` | `OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED` |
| Operation lifecycle | `operation-lifecycle.job.ts` | `OPERATION_LIFECYCLE_JOB_ENABLED` |
| Admin alerts | `admin-alert.job.ts` | `ADMIN_ALERT_WORKER_ENABLED` |

## Apéndice B — Defaults bot (config)

```text
BOT_DEFAULT_RADIUS_METERS=150
BOT_GEOFENCE_REVIEW_MARGIN_METERS=30
BOT_ON_TIME_GRACE_MINUTES=15
BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES=15
BOT_OPERATION_TIMEZONE=America/Argentina/Buenos_Aires
BOT_SESSION_TTL_MINUTES=15
```

(Overrides por `company_settings` donde aplique.)

## Apéndice C — Estado Git al auditar

- Branch: `DIN-330` tracking `origin/DIN-330`
- HEAD: `fb8994f` — update test (whatsapp-router + webhook integration test)
- Working tree: limpio en la inspección
- `main` incluye merge de DIN-330; `develop` en `701bdf7` (verificar sync con main según necesidad)

## Apéndice D — Discrepancias documentación vs código

| Tema | Docs (README) | Código |
|------|---------------|--------|
| UI kit | Material UI | Mantine 9 |
| Mapas | Leaflet | Google Maps |
| Entidades | tienda / inventario | servicio (`operational_locations`) / operación (`scheduled_operations`) |
| Alcance | MVP asistencia | + ausencias, payroll, work teams, observability, admin alerts, 2FA, multi-company |
