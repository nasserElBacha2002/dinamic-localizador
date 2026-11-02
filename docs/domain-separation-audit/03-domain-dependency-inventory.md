# Domain dependency inventory

Clasificación: **prod** | **dev** | **test** | **docs** | **dead** | **executed** | **external-expected**

## Strings `dinamicoperations.com` (grep repo)

| Ubicación | Clasificación | Rol |
|-----------|---------------|-----|
| `deploy/nginx.*dinamicoperations.com*.template` | prod + executed (cuando se aplican) | Routing TLS/host |
| `website/index.html`, `landing-content.ts` | prod + executed | canonical, og:url |
| `website/public/sitemap.xml`, `robots.txt` | prod + executed | SEO |
| `frontend/public/sitemap.xml`, `robots.txt` | prod + executed (vía app en apex hoy) | Duplicado SEO — **RIESGO post-separación** |
| `website/src/seo/marketing-sitemap.test.ts` | test + executed | Contrato SEO unificado |
| `docs/production-domain-cutover.md`, `landing-deploy-audit.md` | docs | Runbook |
| `website/.env.example` comentario `app.dinamicoperations.com` | dev/docs | Objetivo futuro |
| `website/README.md` | docs | Describe arquitectura unificada actual |

## `www.dinamicoperations.com`

- Solo comentarios en plantilla Nginx (redirect 301 opcional a apex). **NO VERIFICABLE** si DNS www existe en producción.

## Legacy `dinamiceducation.com`

- Solo en `docs/production-domain-cutover.md` y `landing-deploy-audit.md`. **No** en código de aplicación (afirmación del doc confirmada por grep).

## Variables de entorno (patrones)

| Variable | Dónde | Uso ejecutado |
|----------|-------|---------------|
| `FRONTEND_URL` | backend `env.ts`, emails, admin URLs | **Sí** — URLs absolutas usuario |
| `APP_BASE_URL` | compose prod required | **No** en `backend/src` fuera de schema — solo compose |
| `CORS_ALLOWED_ORIGINS` | `parseCorsOrigins` | **Sí** |
| `VITE_API_URL` | frontend build | **Sí** — base axios |
| `VITE_OPERATIONS_APP_URL` | website build | **Sí** si set; prod CI = vacío → `/login` relativo |
| `TWILIO_WEBHOOK_URL` | signature validation | **Sí** — debe coincidir con Twilio Console |
| `TWILIO_STATUS_CALLBACK_URL` | outbound + status route | **Sí** si callbacks enabled |
| `VITE_GOOGLE_MAPS_*` | frontend maps | **Sí** — referrer en GCP externo |

## Construcción dinámica de URLs

| Mecanismo | Archivo | Dependencia host |
|-----------|---------|------------------|
| `env.FRONTEND_URL + path` | `invitation-email.ts`, `password-reset-email.ts`, `absence-request-admin-url.ts` | **Cambio obligatorio** a `app.*` |
| `getOperationsLoginUrl()` | `operations-app-url.ts` | Relativo si env vacío; absoluto si `VITE_OPERATIONS_APP_URL` |
| `window.location` | `ResetPasswordPage`, `AcceptInvitationPage` | Token en query — host donde abra el link |
| `VITE_API_URL` | `client.ts` | API host, no frontend |
| Twilio signature | `TWILIO_WEBHOOK_URL` env | API host fijo, no request Host |

## localhost / 127.0.0.1

| Uso | Clasificación |
|-----|---------------|
| `.env.example`, README | dev |
| `parseCorsOrigins` loopback alias | dev/test executed |
| `docker-compose.prod` bind 127.0.0.1 | prod executed |
| Health checks deploy | prod executed |

## PWA / service worker

- **N/A** — no manifest PWA ni service worker de producto encontrados (solo deps npm irrelevantes).

## OAuth / redirect_uri

- **N/A** para login de usuarios. GCP service account JSON example contiene URIs Google OAuth (adjuntos), no login social app.

## Resumen de dependencias ocultas del hostname

1. **Backend CORS allowlist** — origen browser debe listar exactamente `https://app.dinamicoperations.com` tras migración.
2. **Build-time VITE** — frontend API URL y website login URL no se corrigen con DNS solo.
3. **Emails y templates WhatsApp admin** — `FRONTEND_URL`.
4. **Google Maps** — restricción por referrer en consola (externo).
5. **Tests de contrato SEO** — asumen sitemap/robots idénticos en frontend y website.
6. **Bookmarks y emails ya enviados** — apex `/login`, `/reset-password`, etc.

## Tabla de variables de entorno (§18)

| Variable | Uso actual | Valor conceptual prod (doc/hoy) | Cambio requerido | Riesgo |
|----------|------------|----------------------------------|------------------|--------|
| `FRONTEND_URL` | Emails, admin URLs, CORS fallback si no hay CORS list | `https://dinamicoperations.com` | `https://app.dinamicoperations.com` | P1 enlaces rotos |
| `CORS_ALLOWED_ORIGINS` | Allowlist browser prod (obligatorio compose prod) | `https://dinamicoperations.com` | `https://app.dinamicoperations.com` | P1 API inutilizable desde app |
| `APP_BASE_URL` | Compose prod required | `https://api.dinamicoperations.com` | Sin cambio (API) | P3 — no consumida en código backend |
| `VITE_API_URL` | Build frontend axios base | `https://api.dinamicoperations.com/api` | Sin cambio si API estable | P1 si incorrecto en GHCR vars |
| `VITE_OPERATIONS_APP_URL` | Build website CTA login | vacío → `/login` relativo | `https://app.dinamicoperations.com` | P1 CTA wrong host |
| `TWILIO_WEBHOOK_URL` | Firma inbound | `https://api…/api/webhooks/twilio/whatsapp` | Sin cambio | P0 si path/host wrong |
| `TWILIO_STATUS_CALLBACK_URL` | Firma status | `https://api…/…/status` | Sin cambio | P1 observability |
| `WEBSITE_HOST_PORT` | Nginx → website | 8085 | Sin cambio | P2 |
| `FRONTEND_HOST_PORT` | Nginx → frontend | 8084 | Sin cambio | P2 |
| `BACKEND_HOST_PORT` | Nginx → API | 3004 | Sin cambio | P2 |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JS | referrer-restricted | Añadir referrer `app.*` en GCP | P2 maps broken |
| `DEPLOY_*_HEALTH_URL` | CI deploy smoke | loopback | Sin cambio | P3 |
| `JWT_SECRET` | Tokens | secreto | Sin cambio | — |
| `SMTP_*` | Email | proveedor | Sin cambio | — |
| `NODE_ENV` | production | production | Sin cambio | — |
