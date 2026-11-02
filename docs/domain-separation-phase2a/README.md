# Fase 2A — Host `app.dinamicoperations.com` (sin tocar apex)

**Alcance:** DNS `app` → bootstrap HTTP app → Certbot app → HTTPS app → smoke tests.  
**Fuera de alcance:** plantillas apex separadas, redirects legacy, `FRONTEND_URL` / CORS prod (Fase 2B).

Runbook detallado: [docs/production-domain-cutover.md](../production-domain-cutover.md) (sección Fase 2A).

## Checklist operativo (servidor + DNS proveedor)

| Paso | Acción | Evidencia |
|------|--------|-----------|
| 2A.1 | DNS `A` `app` → IP servidor | `dig +short app.dinamicoperations.com` |
| 2A.2 | Backup Nginx apex actual (no reemplazar por plantilla separada) | `*.backup-*` en sites-available |
| 2A.3 | Bootstrap **solo** `nginx.bootstrap.app.dinamicoperations.com.conf.template` | `nginx -t` |
| 2A.4 | Smoke HTTP `http://app.dinamicoperations.com/login` | curl 200 |
| 2A.5 | Certbot `-d app.dinamicoperations.com` | cert en `/etc/letsencrypt/live/app.dinamicoperations.com/` |
| 2A.6 | HTTPS `nginx.app.dinamicoperations.com.conf.template` | `nginx -t` + reload |
| 2A.7 | Smoke HTTPS login + deep link + `/sitemap.xml` 404 | curl -I |

## Comandos (referencia)

```bash
export FRONTEND_HOST_PORT=8084

envsubst '${FRONTEND_HOST_PORT}' \
  < deploy/nginx.bootstrap.app.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/app.dinamicoperations.com

sudo ln -sf /etc/nginx/sites-available/app.dinamicoperations.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certonly --nginx -d app.dinamicoperations.com

envsubst '${FRONTEND_HOST_PORT}' \
  < deploy/nginx.app.dinamicoperations.com.conf.template \
  | sudo tee /etc/nginx/sites-available/app.dinamicoperations.com

sudo nginx -t && sudo systemctl reload nginx
```

## Estado de ejecución

```text
BLOCKED — ver phase2a-status.txt
```

Evidencia y runbook por paso: `01-precheck.md` … `09-phase2a-summary.md`.

**Bloqueador actual (2026-11-02):** no existe registro DNS `A` para `app.dinamicoperations.com` (apex/api → `170.239.85.196`). Crear registro en proveedor DNS, luego ejecutar bootstrap/Certbot vía SSH.

La Fase 2A requiere acceso a Hostinger/DNS y SSH al servidor de producción; el agente documentó baseline público pero no aplicó Nginx en prod.

## Post-2A

Continuar con **Fase 2B** (env + redeploy) antes de **Fase 2C** (apex solo website).
