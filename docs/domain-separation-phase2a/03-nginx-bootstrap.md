# Fase 2A — Nginx bootstrap (solo `app.*`)

## Principio

- **Instalar solo:** `deploy/nginx.bootstrap.app.dinamicoperations.com.conf.template`
- **No modificar** sites apex en producción en esta fase.
- **No instalar** `deploy/nginx.dinamicoperations.com.conf.template` (apex separado).

## Auditoría previa (operador — no ejecutada aquí)

```bash
sudo nginx -t
sudo nginx -T | less
# o: sudo cat /etc/nginx/sites-enabled/*
```

Registrar qué archivo atiende hoy:

- `dinamicoperations.com`
- `api.dinamicoperations.com`

Comparar repo vs `/etc/nginx/sites-available` vs `sites-enabled`. Clasificar divergencias: EXPECTED / RISK / BLOCKER.

## Backup (antes de escribir `app` site)

```bash
TS=$(date -u +%Y%m%d-%H%M%S)
ls -la /etc/nginx/sites-available
ls -la /etc/nginx/sites-enabled

# solo si ya existe:
sudo cp /etc/nginx/sites-available/app.dinamicoperations.com \
  "/etc/nginx/sites-available/app.dinamicoperations.com.backup-$TS"
```

## Instalación bootstrap (referencia repo)

Desde el clone en servidor:

```bash
cd /opt/dinamic-attendance/dinamic-localizador
export FRONTEND_HOST_PORT=8084

envsubst '${FRONTEND_HOST_PORT}' \
  < deploy/nginx.bootstrap.app.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/app.dinamicoperations.com

# crear symlink solo si no existe (evitar reemplazo ciego):
test -L /etc/nginx/sites-enabled/app.dinamicoperations.com || \
  sudo ln -s /etc/nginx/sites-available/app.dinamicoperations.com \
    /etc/nginx/sites-enabled/app.dinamicoperations.com

sudo nginx -t && sudo systemctl reload nginx
sudo systemctl status nginx --no-pager
```

## Contrato bootstrap (repo)

- `/api/*` → **404** (no proxy al backend)
- `/sitemap.xml` → **404**
- `/`, `/login`, `/robots.txt`, `/assets/*` → proxy `127.0.0.1:8084`
- `X-Robots-Tag: noindex, nofollow` en rutas SPA/assets

## Estado de ejecución

```text
NOT_APPLIED — bloqueado por ausencia de DNS app.*; sin acceso SSH para aplicar config.
```

## HTTP pre-TLS (después de DNS + bootstrap)

```bash
curl -i http://app.dinamicoperations.com/
curl -i http://app.dinamicoperations.com/login
curl -i http://app.dinamicoperations.com/robots.txt
curl -i http://app.dinamicoperations.com/sitemap.xml
curl -i http://app.dinamicoperations.com/api/health
```

Esperado: `/` y `/login` 200; `robots.txt` 200; `sitemap.xml` y `/api/health` 404.
