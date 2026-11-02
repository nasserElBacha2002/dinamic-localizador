# Nginx, DNS, TLS

## Estado en repositorio

### Apex `dinamicoperations.com`

Archivos: `deploy/nginx.bootstrap.dinamicoperations.com.conf.template`, `deploy/nginx.dinamicoperations.com.conf.template`.

| Directiva | Comportamiento |
|-----------|----------------|
| `server_name` | `dinamicoperations.com` |
| TLS | Let's Encrypt paths `live/dinamicoperations.com/` |
| HTTP | 301 → HTTPS apex |
| `location = /` | website upstream |
| `location /` (prefix) | frontend upstream |
| `location /api/` | **404** |
| `^~ /assets/` | frontend (Vite build) |
| `^~ /marketing-assets/` | website |
| `= /sitemap.xml`, `= /robots.txt` | website |
| `proxy_set_header Host` | `$host` |
| Referrer-Policy | `no-referrer` en catch-all app |

**DEFECTO CONFIRMADO (P2 — SEO/arquitectura):** Mismo certificado/host mezcla marketing indexable y rutas app en un solo `server_name`.

### API `api.dinamicoperations.com`

Archivos: `deploy/nginx.bootstrap.api.*`, `deploy/nginx.api.dinamicoperations.com.conf.template`.

- Proxy `/` → `127.0.0.1:${BACKEND_HOST_PORT}`.
- TLS cert dedicado `live/api.dinamicoperations.com/`.

### `app.dinamicoperations.com`

- **GAP:** No hay plantilla en `deploy/`.
- Propuesta (no aplicada):

```nginx
# Conceptual — app.dinamicoperations.com
server {
    listen 443 ssl http2;
    server_name app.dinamicoperations.com;
    # ssl_certificate …/app.dinamicoperations.com/…

    location ^~ /assets/ {
        proxy_pass http://127.0.0.1:${FRONTEND_HOST_PORT};
        # headers estándar X-Forwarded-*
    }

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_HOST_PORT};
        add_header Referrer-Policy "no-referrer" always;
        add_header X-Robots-Tag "noindex, nofollow" always;  # recomendado
    }
}
```

### Apex objetivo (solo website)

- Eliminar proxy a `FRONTEND_HOST_PORT` en `location /` excepto redirects legacy acotados.
- Mantener rutas SEO y `marketing-assets/`.
- **Conflicto a evitar:** no usar `location /` catch-all a website **y** redirects app en el mismo bloque sin precedencia `^~` / `=` — usar map o locations exactas para `/login`, `/operations`, etc. antes del fallback SPA website (si website crece más rutas públicas).

## DNS (conceptual)

| Registro | Nombre | Valor | Notas |
|----------|--------|-------|-------|
| A | `@` | IP servidor (doc: 170.239.85.196) | website |
| A | `api` | misma IP | backend |
| A | `app` | misma IP | **nuevo** frontend |
| A/CNAME | `www` | apex o IP | 301 a `https://dinamicoperations.com` recomendado |

TTL: bajar TTL 300–600 s **antes** del cutover para rollback DNS rápido (**NO VERIFICABLE** TTL actual en Hostinger).

## TLS / Certbot

- Certificados separados apex vs api en plantillas actuales.
- **Nuevo certificado** requerido para `app.dinamicoperations.com` (o SAN multi-dominio — menos recomendado para renovación clara).

Comandos conceptuales:

```bash
sudo certbot certonly --nginx -d app.dinamicoperations.com
```

Renovación: verificar que `certbot renew` incluye el nuevo vhost (depende de sites-enabled en servidor — **NO VERIFICABLE**).

## Puertos loopback (Compose prod)

| Servicio | Variable | Default doc |
|----------|----------|-------------|
| website | `WEBSITE_HOST_PORT` | 8085 |
| frontend | `FRONTEND_HOST_PORT` | 8084 |
| backend | `BACKEND_HOST_PORT` | 3004 |

## Websockets

- No hay upgrade WebSocket en plantillas auditadas; app usa HTTP polling/REST.

## gzip / cache

- Cache largo en `/assets/` y `/marketing-assets/` vía `add_header Cache-Control` en host template.

## Plantilla legacy `deploy/nginx.host.conf.template`

- Modelo **separado** tracker + api (sin website) — útil referencia histórica; producción nueva usa plantillas `dinamicoperations.com`.

## Redirects www / HTTP

- Apex HTTP → HTTPS implementado en template final.
- Bloque www comentado — activar si DNS www existe.
