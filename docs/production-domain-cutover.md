# Production domain cutover — dinamicoperations.com

Guía operativa para pasar de dominios legacy a la arquitectura unificada **sin big-bang**.  
**No ejecutar cutover de Nginx/DNS hasta que el contenedor website esté healthy en `127.0.0.1:8085`.**

## Arquitectura objetivo

```text
Internet
    |
    v
Nginx (host, Ubuntu 22.04)
    |
    +-- https://dinamicoperations.com/
    |       -> 127.0.0.1:8085 (dinamic-attendance-website)
    +-- https://dinamicoperations.com/login, /operations, ...
    |       -> 127.0.0.1:8084 (dinamic-attendance-frontend)
    +-- https://api.dinamicoperations.com/
            -> 127.0.0.1:3004 (dinamic-attendance-backend)
```

Legacy (mantener hasta validar):

- `https://tracker.dinamiceducation.com` → frontend
- `https://api-tracker.dinamiceducation.com` → backend

## Fase A — Deploy website (sin tocar Nginx público)

1. Merge a `develop` con cambios de `website/`, compose y workflows.
2. Verificar GitHub Actions **Deploy Website (develop)** (build GHCR + SSH).
3. En servidor, `.env` debe incluir `WEBSITE_IMAGE` (GHCR).  
   **`WEBSITE_HOST_PORT`:** el script `deploy-website.sh` lo agrega o completa con `8085` si falta o está vacío; no pisa un puerto ya definido.

4. Validación interna:

```bash
cd /opt/dinamic-attendance/dinamic-localizador
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml ps website
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8085/
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8085/health
# Sustituir HASH por un archivo real bajo dist (ej. tras inspeccionar el contenedor):
curl -fsS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8085/marketing-assets/<archivo>.js"
```

Esperado: `200` en `/`, `/health` y al menos un asset bajo `/marketing-assets/`.

## Fase B — DNS (Hostinger)

Configurar **solo** estos registros (IP confirmada por operación: `170.239.85.196`):

| Tipo | Nombre | Valor |
|------|--------|--------|
| A | `@` | `170.239.85.196` |
| A | `api` | `170.239.85.196` |
| A o CNAME | `www` | `dinamicoperations.com` o `170.239.85.196` (opcional) |

No modificar DNS de `tracker.dinamiceducation.com` / `api-tracker.dinamiceducation.com` hasta después del cutover.

Verificar propagación:

```bash
dig +short dinamicoperations.com A
dig +short api.dinamicoperations.com A
```

## Fase C — Nginx bootstrap HTTP (obligatorio antes de SSL)

**Nunca** instalar las plantillas HTTPS (`nginx.dinamicoperations.com.conf.template` / `nginx.api.dinamicoperations.com.conf.template`) hasta tener certificados en disco. Esas plantillas usan `listen 443 ssl` con rutas Let's Encrypt reales.

### Backup

```bash
sudo cp /etc/nginx/sites-available/<config-actual> \
  "/etc/nginx/sites-available/<config-actual>.backup-$(date -u +%Y%m%d-%H%M%S)"
```

### STEP 1 — Instalar solo bootstrap HTTP (:80)

Plantillas:

- `deploy/nginx.bootstrap.dinamicoperations.com.conf.template` (`server_name dinamicoperations.com` — **sin www por defecto**)
- `deploy/nginx.bootstrap.api.dinamicoperations.com.conf.template`

```bash
export WEBSITE_HOST_PORT=8085 FRONTEND_HOST_PORT=8084 BACKEND_HOST_PORT=3004
envsubst '${WEBSITE_HOST_PORT} ${FRONTEND_HOST_PORT}' \
  < deploy/nginx.bootstrap.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/dinamicoperations.com
envsubst '${BACKEND_HOST_PORT}' \
  < deploy/nginx.bootstrap.api.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/api.dinamicoperations.com
sudo ln -sf /etc/nginx/sites-available/dinamicoperations.com /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/api.dinamicoperations.com /etc/nginx/sites-enabled/
```

Si configurás **DNS www**, duplicá un bloque `listen 80` con `server_name www.dinamicoperations.com` (mismo proxy) **antes** de pedir certificado con `-d www`.

### STEP 2 — `sudo nginx -t`

### STEP 3 — `sudo systemctl reload nginx`

### STEP 4 — Verificar DNS + HTTP

```bash
curl -sI http://dinamicoperations.com/ | head -1
curl -sI http://api.dinamicoperations.com/api/health | head -1
```

No deshabilitar dominios legacy aún.

## Fase D — SSL (Certbot, manual)

Con bootstrap HTTP activo y DNS resolviendo:

### STEP 5 — Certbot

**Solo apex** (sin registro www):

```bash
sudo certbot certonly --nginx -d dinamicoperations.com
sudo certbot certonly --nginx -d api.dinamicoperations.com
```

**Con DNS www** configurado:

```bash
sudo certbot certonly --nginx -d dinamicoperations.com -d www.dinamicoperations.com
sudo certbot certonly --nginx -d api.dinamicoperations.com
```

### STEP 6 — Instalar config HTTPS final

```bash
envsubst '${WEBSITE_HOST_PORT} ${FRONTEND_HOST_PORT}' \
  < deploy/nginx.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/dinamicoperations.com
envsubst '${BACKEND_HOST_PORT}' \
  < deploy/nginx.api.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/api.dinamicoperations.com
```

Ajustar `ssl_certificate` si Certbot usó otro path. Descomentar bloque `www` en plantilla apex solo si emitiste cert con www.

### STEP 7 — `sudo nginx -t`

### STEP 8 — `sudo systemctl reload nginx`

## Fase E — Variables de producción (`.env` servidor + GitHub)

Tras SSL y smoke tests en nuevos hosts:

| Variable | Valor anterior (ejemplo) | Valor nuevo |
|----------|--------------------------|-------------|
| `FRONTEND_URL` | `https://tracker.dinamiceducation.com` | `https://dinamicoperations.com` |
| `APP_BASE_URL` | `https://api-tracker.dinamiceducation.com` | `https://api.dinamicoperations.com` |
| `CORS_ALLOWED_ORIGINS` | `https://tracker.dinamiceducation.com` | `https://dinamicoperations.com` |
| `VITE_API_URL` (GitHub `vars` + rebuild frontend) | `https://api-tracker.../api` | `https://api.dinamicoperations.com/api` |

Website: CTA **Ingresar** usa `/login` relativo (sin `VITE_OPERATIONS_APP_URL` en imagen CI).

Redeploy backend (env) y frontend (nueva imagen con `VITE_API_URL`).

## Fase F — Twilio / URLs externas (checklist manual)

Referencias en repo a dominios legacy: **ninguna hardcodeada** (solo plantillas `*.example.com`).

Actualizar en **Twilio Console** y proveedores externos (valores reales viven en `.env` del servidor, no en git):

- [ ] `TWILIO_WEBHOOK_URL` → `https://api.dinamicoperations.com/api/whatsapp/webhook` (confirmar path exacto en backend)
- [ ] `TWILIO_STATUS_CALLBACK_URL` si aplica
- [ ] Plantillas / callbacks documentados en Twilio
- [ ] Cualquier integración que llame a `api-tracker.dinamiceducation.com`

Emails (invitación, reset password) usan `FRONTEND_URL` en backend — se corrigen al actualizar env.

## Fase G — Cutover checklist

Solo continuar si todo OK:

- [ ] `dinamic-attendance-website` healthy, `127.0.0.1:8085`
- [ ] `dinamic-attendance-frontend` healthy, `127.0.0.1:8084`
- [ ] `dinamic-attendance-backend` healthy, `127.0.0.1:3004/api/health`
- [ ] DNS `dinamicoperations.com` y `api.dinamicoperations.com` resuelven
- [ ] SSL válido
- [ ] `sudo nginx -t` OK
- [ ] `https://dinamicoperations.com/` → landing
- [ ] `https://dinamicoperations.com/login` → app
- [ ] Refresh en `/operations`, `/employees`, etc.
- [ ] `https://api.dinamicoperations.com/api/health` → 200
- [ ] Login, logout, API, CORS, mapas (si aplica)
- [ ] Flujos WhatsApp en staging o ventana controlada

## Fase H — Post-cutover y legacy

**No** redirigir API legacy hasta revisar Twilio e integraciones.

Opcional tras período de observación:

```nginx
# tracker.dinamiceducation.com — solo si no rompe enlaces críticos
return 301 https://dinamicoperations.com$request_uri;
```

## Rollback

| Fallo | Acción |
|-------|--------|
| Landing | Quitar `location = /` hacia website; proxy `/` a frontend legacy; reload Nginx |
| Frontend | `FRONTEND_IMAGE=<sha-anterior>` + `deploy-frontend.sh` |
| Website | `WEBSITE_IMAGE=<sha-anterior>` + `deploy-website.sh` |
| Nginx | Restaurar backup `*.backup-YYYYMMDD-HHMMSS`, `nginx -t`, reload |
| Env / API | Revertir `.env` y `vars` GitHub; redeploy backend + frontend |
| DNS nuevo | Mantener legacy activos; no tocar DNS viejos |

## GitHub Actions

| Workflow | Artefacto |
|----------|-----------|
| Deploy Frontend | `ghcr.io/<repo>/frontend:$SHA` |
| Deploy Website | `ghcr.io/<repo>/website:$SHA` |
| Deploy Backend | build en servidor (sin cambio en esta fase) |

Secrets/vars compartidos: `DEPLOY_*`, `GHCR_PULL_TOKEN`, `VITE_*`, `DEPLOY_*_HEALTH_URL`, agregar `DEPLOY_WEBSITE_HEALTH_URL` (default `http://127.0.0.1:8085/health`).
