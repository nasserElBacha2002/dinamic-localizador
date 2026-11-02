# Production domain cutover — dinamicoperations.com

Guía operativa para cutover de dominios legacy y **separación website / app / API**.  
Preparación en repo: [domain-separation-phase1](../domain-separation-phase1/).

## Arquitectura objetivo

```text
dinamicoperations.com     → website (+ redirects legacy selectivos a app.*)
app.dinamicoperations.com → frontend SPA
api.dinamicoperations.com → backend / Twilio webhooks
```

### Plantillas Nginx

| Host | HTTPS (objetivo) | Bootstrap HTTP | Rollback unificado legacy |
|------|------------------|----------------|---------------------------|
| apex | `nginx.dinamicoperations.com.conf.template` | `nginx.bootstrap.dinamicoperations.com.conf.template` | `nginx.dinamicoperations.com.legacy-unified.conf.template` |
| app | `nginx.app.dinamicoperations.com.conf.template` | `nginx.bootstrap.app.dinamicoperations.com.conf.template` | — |
| api | `nginx.api.dinamicoperations.com.conf.template` | `nginx.bootstrap.api.dinamicoperations.com.conf.template` | — |

Bootstrap legacy unificado (solo rollback): `nginx.bootstrap.dinamicoperations.com.legacy-unified.conf.template`.

**Importante:** La plantilla apex **objetivo** redirige `/login`, `/operations`, etc. a `${APP_PUBLIC_ORIGIN}`. **No instalarla en el apex hasta que `https://app.dinamicoperations.com` funcione con TLS.**

Redirects legacy (lista mantenida inline en plantillas apex objetivo):

- `/login`, `/login/2fa`, `/forgot-password`, `/reset-password`, `/invitations/accept`
- Prefijos: `/operations`, `/employees`, `/absences`, `/settings`, `/platform`

---

## Fase A — Deploy contenedores (sin Nginx público)

Validar website (`8085`), frontend (`8084`), backend (`3004/api/health`) en loopback.

---

## Fase B — DNS base

Registros `A` (o CNAME) para `@`, `api`, y **`app`** cuando inicie Fase 2A.

---

## Fase 2A — Solo host `app.*` (sin tocar apex objetivo)

Objetivo: TLS y SPA en `app.dinamicoperations.com` mientras el apex sigue en **configuración legacy unificada** (o backup previo).

1. DNS `app` → IP servidor.
2. **No** instalar `nginx.bootstrap.dinamicoperations.com.conf.template` (separada) todavía.
3. Bootstrap **solo** app (+ api si aún no está):

```bash
export FRONTEND_HOST_PORT=8084 BACKEND_HOST_PORT=3004

envsubst '${FRONTEND_HOST_PORT}' \
  < deploy/nginx.bootstrap.app.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/app.dinamicoperations.com

sudo ln -sf /etc/nginx/sites-available/app.dinamicoperations.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

4. Smoke HTTP: `curl -sI http://app.dinamicoperations.com/login | head -1`
5. Certbot **solo app**: `sudo certbot certonly --nginx -d app.dinamicoperations.com`
6. HTTPS app:

```bash
envsubst '${FRONTEND_HOST_PORT}' \
  < deploy/nginx.app.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/app.dinamicoperations.com
sudo nginx -t && sudo systemctl reload nginx
```

7. Validar: `https://app.dinamicoperations.com/login`, deep link `/operations`, `/sitemap.xml` → 404.

---

## Fase 2B — Backend env + imágenes (sin cambiar apex a redirects)

En servidor `.env` y GitHub `vars`:

| Variable | Valor |
|----------|--------|
| `FRONTEND_URL` | `https://app.dinamicoperations.com` |
| `CORS_ALLOWED_ORIGINS` | `https://app.dinamicoperations.com` |
| `VITE_API_URL` | `https://api.dinamicoperations.com/api` |
| `VITE_OPERATIONS_APP_URL` | `https://app.dinamicoperations.com` |

Redeploy backend, frontend, website. Validar login/CORS/emails/Maps (referrer `https://app.dinamicoperations.com/*` en GCP).

Twilio (host `api.*`, paths reales):

- `TWILIO_WEBHOOK_URL` = `https://api.dinamicoperations.com/api/webhooks/twilio/whatsapp`
- `TWILIO_STATUS_CALLBACK_URL` = `https://api.dinamicoperations.com/api/webhooks/twilio/whatsapp/status`

---

## Fase 2C — Apex solo website + redirects (cutover marketing host)

**Precondición:** Fase 2A y 2B OK.

```bash
export WEBSITE_HOST_PORT=8085 APP_PUBLIC_ORIGIN=https://app.dinamicoperations.com

envsubst '${WEBSITE_HOST_PORT} ${APP_PUBLIC_ORIGIN}' \
  < deploy/nginx.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/dinamicoperations.com
```

Certbot apex (y api si falta). Bootstrap/HTTPS apex **objetivo** solo en este paso — **nunca** mezclar con el primer bootstrap de certificado app.

Validar:

- `https://dinamicoperations.com/` → website
- `https://dinamicoperations.com/login` → 301 → `https://app.dinamicoperations.com/login?…`

---

## Rollback a arquitectura unificada apex

**Preferido:** restaurar backup timestamp de `/etc/nginx/sites-available/dinamicoperations.com`.

**Alternativa desde repo** (restaura frontend en apex, sin redirects a app):

```bash
export WEBSITE_HOST_PORT=8085 FRONTEND_HOST_PORT=8084
envsubst '${WEBSITE_HOST_PORT} ${FRONTEND_HOST_PORT}' \
  < deploy/nginx.dinamicoperations.com.legacy-unified.conf.template \
  | sudo tee /etc/nginx/sites-available/dinamicoperations.com
sudo nginx -t && sudo systemctl reload nginx
```

Revertir `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` a `https://dinamicoperations.com` y redeploy. Deshabilitar site `app.*` si corresponde.

Detalle: [domain-separation-audit/10-rollback-plan.md](../domain-separation-audit/10-rollback-plan.md).

---

## Entorno legacy previo (tracker.dinamiceducation.com)

Mantener hasta validar; no redirigir API legacy sin revisar Twilio.

## GitHub Actions

| Workflow | Vars |
|----------|------|
| Deploy Frontend | `VITE_API_URL`, `VITE_GOOGLE_MAPS_*` |
| Deploy Website | `VITE_OPERATIONS_APP_URL` (vacío = `/login` relativo pre-cutover) |
