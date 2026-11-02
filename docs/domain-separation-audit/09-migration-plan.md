# Migration plan (phased)

Adaptado al estado real del repo (website GHCR, API ya en subdominio, apex unificado).

## Fase 0 — Auditoría

- Completada: `docs/domain-separation-audit/`.
- Validar en servidor: Nginx activo, `.env`, certificados, Twilio Console (**manual**).

## Fase 1 — Preparación código (sin cutover DNS)

- Añadir plantillas `deploy/nginx.app.dinamicoperations.com.conf.template` (+ bootstrap HTTP).
- Actualizar `deploy/nginx.dinamicoperations.com.conf.template` **versión objetivo** (solo website + redirects legacy).
- Website: documentar/producir build con `VITE_OPERATIONS_APP_URL=https://app.dinamicoperations.com`.
- Frontend: `index.html` meta robots noindex; `robots.txt` app-specific; retirar/ajustar `sitemap.xml` en frontend.
- Actualizar tests SEO (`marketing-sitemap.test.ts`) para políticas separadas.
- Actualizar `docs/production-domain-cutover.md` paths Twilio.

## Fase 2 — Infraestructura app (pre-producción)

- DNS `app` → IP servidor (TTL bajo).
- Bootstrap Nginx HTTP `app.*` → `127.0.0.1:8084`.
- Certbot cert `app.dinamicoperations.com`.
- Instalar plantilla HTTPS app.
- Validar: `curl -I https://app.dinamicoperations.com/login` (200 SPA).

## Fase 3 — Backend env (ventana controlada)

- `FRONTEND_URL=https://app.dinamicoperations.com`
- `CORS_ALLOWED_ORIGINS=https://app.dinamicoperations.com` (añadir legacy apex solo si necesario temporalmente)
- Redeploy backend container (sin cambio Twilio si API host igual).
- Smoke: login desde `app.*`, CORS preflight OK.

## Fase 4 — Deploy imágenes

- Rebuild + deploy frontend (GHCR) — `VITE_API_URL` típicamente `https://api.dinamicoperations.com/api`.
- Rebuild + deploy website con `VITE_OPERATIONS_APP_URL` absoluto.
- Verificar CTA Ingresar → `app.*/login`.

## Fase 5 — Cutover apex Nginx

- Cambiar apex: quitar `location /` → frontend; mantener website routes.
- Añadir redirects 301 map para rutas app legacy (ver lista abajo).
- Reload Nginx.
- Validar apex `/` website; `/login` → 301 app.

## Fase 6 — SEO / Search Console

- Sitemap solo en apex.
- Solicitar re-crawl; monitorear indexación app subdomain (debe estar vacía/noindex).

## Fase 7 — Legacy

- Mantener redirects 301 apex→app mínimo 6–12 meses.
- Evaluar redirect `tracker.dinamiceducation.com` → `app.*` (doc cutover).

## Fase 8 — Monitoring

- Health: website `/health`, frontend `/`, backend `/api/health`.
- Alertas 4xx/5xx en Nginx access logs por vhost.
- Twilio webhook error rate.

## Fase 9 — Retirar compatibilidad

- Tras métricas bajas en redirects legacy, reducir lista (no eliminar `/login` pronto).

## Redirects legacy recomendados (301)

Prioridad alta (enlaces email y bookmarks):

- `/login`, `/login/2fa`, `/forgot-password`, `/reset-password`, `/invitations/accept`
- `/` en app context — **no** redirect apex `/` (es website); usuarios autenticados en apex `/` desaparece tras cutover

Rutas operativas frecuentes (301 a mismo path en app):

- `/operations`, `/employees`, `/absences`, `/settings/*`, `/platform/*`

**Riesgo:** conflictos si website publica `/operations` como landing futura — usar prefijo marketing (`/soluciones/...`) para nuevas páginas públicas.

## Desarrollo local

- **Sin simular subdomios:** mantener `localhost:8085` website + `localhost:8084` frontend + `VITE_OPERATIONS_APP_URL=http://localhost:8084`.
- `FRONTEND_URL` / CORS en backend apuntando a puerto frontend local.
- Paridad prod solo en staging opcional con `/etc/hosts` (`app.local.test`).

## Staging

- **NO VERIFICABLE** si existe entorno staging — recomendable replicar 3 hosts antes de prod.

## API: decisión

- **Mantener** `api.dinamicoperations.com` (Alternativa B).
- **No** mover a `/api` en app salvo requisito corporativo de same-origin.
