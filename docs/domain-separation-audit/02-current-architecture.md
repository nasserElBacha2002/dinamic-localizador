# Current architecture

**Evidence date:** 2026-11-02 (auditoría read-only del repositorio).

## Mapa actual (producción objetivo documentada)

```text
Internet
   │
   ▼
Nginx (host Ubuntu, plantillas deploy/nginx.*.dinamicoperations.com.conf.template)
   │
   ├── https://dinamicoperations.com
   │      ├── location = /              → loopback WEBSITE_HOST_PORT (default 8085) → contenedor `website`
   │      ├── location = /sitemap.xml   → website
   │      ├── location = /robots.txt    → website
   │      ├── location ^~ /marketing-assets/ → website
   │      ├── location ^~ /assets/      → loopback FRONTEND_HOST_PORT (8084) → contenedor `frontend`
   │      ├── location /api/            → 404 (API no en apex)
   │      └── location / (catch-all)    → frontend (SPA: /login, /operations, …)
   │
   └── https://api.dinamicoperations.com
          └── location /                 → loopback BACKEND_HOST_PORT → contenedor `backend` (/api/*)
```

Legacy documentado (cutover previo, mantener hasta validar):

```text
https://tracker.dinamiceducation.com     → frontend (histórico)
https://api-tracker.dinamiceducation.com → backend (histórico)
```

## Componentes en el repositorio

| Componente | Ruta | Runtime prod (Compose) | Puerto loopback típico |
|------------|------|------------------------|-------------------------|
| Website marketing | `website/` | Imagen GHCR `WEBSITE_IMAGE` | `127.0.0.1:8085` |
| App operativa | `frontend/` | Imagen GHCR `FRONTEND_IMAGE` | `127.0.0.1:8084` |
| API | `backend/` | Build/imagen en servidor o GHCR (backend deploy separado) | `127.0.0.1:3004` (doc cutover) |
| SQL Server | `database/` | Contenedor `sqlserver` | no expuesto en prod override |
| Migraciones | `database/migrations/` | Job `migrations` | — |

## Docker Compose

- Desarrollo: `docker-compose.yml` — expone backend, frontend, website en puertos configurables (`FRONTEND_HOST_PORT`, `WEBSITE_HOST_PORT`).
- Producción: `docker-compose.prod.yml` — bind **solo loopback** para backend, frontend, website; imágenes prebuilt para frontend/website.

## CI/CD (GitHub Actions)

| Workflow | Dispara | Artefacto |
|----------|---------|-----------|
| `deploy-website.yml` | `website/**` | GHCR website; SSH `deploy-website.sh` |
| `deploy-frontend.yml` | `frontend/**` | GHCR frontend; `VITE_*` desde `vars` |
| `deploy-backend.yml` | backend paths | backend en servidor |
| `quality-gate.yml` | PR | lint/test/build multi-proyecto |

## Nginx por contenedor

- `website/nginx.conf`: SPA landing, `/health`, estáticos SEO, `marketing-assets/`.
- `frontend/nginx.conf`: SPA app, sirve **también** `sitemap.xml` y `robots.txt` (copias alineadas con website).

## Nginx host (repo)

- `deploy/nginx.dinamicoperations.com.conf.template` — routing unificado apex.
- `deploy/nginx.api.dinamicoperations.com.conf.template` — API TLS.
- `deploy/nginx.bootstrap.*` — HTTP previo a Certbot.
- `deploy/nginx.host.conf.template` — ejemplo genérico `tracker.example.com` + `api.example.com` (legacy doc).

**No existe** en repo plantilla para `app.dinamicoperations.com`.

## Autenticación (alto nivel)

- Login → JWT → `localStorage` key `dinamic_auth_token` → axios `Authorization: Bearer`.
- Sin cookies `Domain=` en backend auditado para sesión de usuario.
- 2FA challenge token en flujo login (no cookie cross-site).

## Integraciones externas (URLs)

| Integración | URL típica | Config |
|-------------|------------|--------|
| Twilio inbound WhatsApp | `POST …/api/webhooks/twilio/whatsapp` | `TWILIO_WEBHOOK_URL` |
| Twilio status | `POST …/api/webhooks/twilio/whatsapp/status` | `TWILIO_STATUS_CALLBACK_URL` |
| Emails invitación/reset | `{FRONTEND_URL}/invitations/accept?…`, `{FRONTEND_URL}/reset-password?…` | `FRONTEND_URL` |
| Alertas admin (WhatsApp templates) | `absenceDetailUrl` desde `FRONTEND_URL` | env |

## Mapa objetivo (separación solicitada)

```text
Internet
   │
   ├── https://dinamicoperations.com
   │      └── solo website (/, SEO, marketing-assets, futuras páginas públicas)
   │
   ├── https://app.dinamicoperations.com
   │      └── solo frontend SPA (login, dashboard, operaciones, …)
   │      └── API: cross-origin → https://api.dinamicoperations.com/api (recomendado, ya alineado)
   │
   └── https://api.dinamicoperations.com
          └── backend (sin cambio de rol)
```

Alternativa **no recomendada** salvo restricción fuerte: `app.dinamicoperations.com/api` reverse proxy → backend (duplica CORS/TLS/wiring ya resuelto en `api.*`).
