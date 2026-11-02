# Fase 2A — Smoke tests HTTPS (`app.*`)

Ejecutar **después** de instalar `deploy/nginx.app.dinamicoperations.com.conf.template` y reload Nginx.

## Headers y rutas

```bash
curl -I https://app.dinamicoperations.com/
curl -I https://app.dinamicoperations.com/login
curl -I https://app.dinamicoperations.com/robots.txt
curl -I https://app.dinamicoperations.com/sitemap.xml
curl -I https://app.dinamicoperations.com/api/health
```

| Ruta | Esperado |
|------|----------|
| `/` | 200 |
| `/login` | 200 + `X-Robots-Tag: noindex, nofollow` |
| `/robots.txt` | 200 |
| `/sitemap.xml` | 404 |
| `/api/health` | 404 |

Preferible en `/login`: `Referrer-Policy: no-referrer`.

## Deep links SPA (curl -I)

`/operations`, `/employees`, `/absences`, `/settings`, `/platform` — no deben devolver 404 estático Nginx ni 502 ni redirect al apex.

## Assets

```bash
ASSET=$(curl -s https://app.dinamicoperations.com/login | grep -oE '/assets/[^"]+' | head -1)
curl -I "https://app.dinamicoperations.com${ASSET}"
```

Esperado: 200, `Cache-Control: public, max-age=31536000, immutable`, `X-Robots-Tag: noindex, nofollow`.

## Login funcional vs smoke infra

- **Smoke infra (2A):** HTML + assets + TLS + deep links vía Nginx.
- **Login contra API:** puede fallar por CORS hasta Fase 2B — **no** es fallo de 2A si infra OK.

## Evidencia actual

```text
curl https://app.dinamicoperations.com/
Could not resolve host: app.dinamicoperations.com
```

**Estado:** `NOT_RUN`
