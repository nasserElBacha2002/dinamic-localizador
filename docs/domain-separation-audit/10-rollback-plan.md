# Rollback plan

Objetivo: volver a arquitectura **unificada apex** (website `/` + app catch-all) sin depender solo de `git revert`.

## Triggers de rollback

- CORS/login masivamente roto en `app.*`.
- Nginx misconfiguration (502 en apex o app).
- Certificado TLS app inválido bloqueando acceso.
- Cutover apex con redirects antes de app HTTPS listo.

## Rollback Nginx (servidor)

### Opción 1 — Backup (preferida)

Restaurar el archivo guardado antes del cutover:

```bash
sudo cp "/etc/nginx/sites-available/dinamicoperations.com.backup-YYYYMMDD-HHMMSS" \
  /etc/nginx/sites-available/dinamicoperations.com
sudo nginx -t && sudo systemctl reload nginx
```

### Opción 2 — Plantilla legacy unificada en repo

**No usar** `nginx.dinamicoperations.com.conf.template` (objetivo separado) para rollback.

```bash
export WEBSITE_HOST_PORT=8085 FRONTEND_HOST_PORT=8084
envsubst '${WEBSITE_HOST_PORT} ${FRONTEND_HOST_PORT}' \
  < deploy/nginx.dinamicoperations.com.legacy-unified.conf.template \
  | sudo tee /etc/nginx/sites-available/dinamicoperations.com
sudo nginx -t && sudo systemctl reload nginx
```

Esto restaura:

- `location = /` → website
- `location /` catch-all → frontend (`/login`, `/operations`, …)

3. Deshabilitar site `app.dinamicoperations.com` si ya no debe servir tráfico:

```bash
sudo rm -f /etc/nginx/sites-enabled/app.dinamicoperations.com
sudo nginx -t && sudo systemctl reload nginx
```

## Rollback DNS

- Mantener o quitar registro `app` según estrategia; enlaces a `app.*` fallarán si se elimina DNS.

## Rollback backend `.env`

```env
FRONTEND_URL=https://dinamicoperations.com
CORS_ALLOWED_ORIGINS=https://dinamicoperations.com
```

Redeploy backend; website con `VITE_OPERATIONS_APP_URL` vacío para CTA `/login` relativo.

## Validación post-rollback

- `https://dinamicoperations.com/` → landing
- `https://dinamicoperations.com/login` → app SPA en **mismo host** (sin 301 a app.*)
- Login + API + Twilio smoke

## Lo que NO es rollback suficiente

- Renderizar `nginx.dinamicoperations.com.conf.template` con solo `WEBSITE_HOST_PORT` / `FRONTEND_HOST_PORT` (requiere `APP_PUBLIC_ORIGIN` y **no** restaura catch-all frontend).
- Solo redeploy git sin Nginx/env.
