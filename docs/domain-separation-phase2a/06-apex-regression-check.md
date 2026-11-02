# Fase 2A — Regresión apex (gate obligatorio)

Comparar **antes y después** de cambios en `app.*` únicamente. Apex **no** debe instalar plantilla separada en 2A.

## Baseline capturado (2026-11-02, pre-cambios app en servidor)

```text
curl -I https://dinamicoperations.com/
HTTP/2 200
server: nginx/1.18.0 (Ubuntu)
content-type: text/html
referrer-policy: no-referrer

curl -I https://dinamicoperations.com/login
HTTP/2 200
server: nginx/1.18.0 (Ubuntu)
content-type: text/html
referrer-policy: no-referrer
```

**Observación:** `/login` en apex sigue sirviendo SPA frontend (200 HTML), **sin** redirect 301 a `app.*` — coherente con Fase 1 / arquitectura legacy unificada.

## Checks adicionales (operador, post-2A)

```bash
curl -I https://dinamicoperations.com/robots.txt
curl -I https://dinamicoperations.com/sitemap.xml
```

Gate de fallo Fase 2A:

```text
dinamicoperations.com/login → 301 Location: https://app.dinamicoperations.com/...
```

Si ocurre sin haber ejecutado Fase 2C → **FASE 2A FAILED** → restaurar config apex.

## Estado post-instalación app

```text
NOT_RETESTED_AFTER_APP — bootstrap app no aplicado aún; baseline apex OK en consulta externa previa.
```
