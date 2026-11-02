# Fase 2A — Regresión API

No modificar backend env, CORS ni Twilio en esta fase.

## Baseline (2026-11-02)

```text
curl -I https://api.dinamicoperations.com/api/health
HTTP/2 200
content-type: application/json; charset=utf-8
strict-transport-security: max-age=31536000; includeSubDomains
```

API operativa en host dedicado `api.*`.

## CORS (expectativa Fase 2A)

Opcional baseline con origin apex:

```bash
curl -i -H 'Origin: https://dinamicoperations.com' \
  https://api.dinamicoperations.com/api/health
```

**No** exigir aún:

```text
Origin: https://app.dinamicoperations.com
```

en respuesta CORS de producción — configuración Fase 2B.

## Twilio

Sin cambios en consola ni `TWILIO_*` URLs. Sanity: API host sigue respondiendo (health arriba).

## Proxy app

Confirmar cuando app exista:

```bash
curl -I https://app.dinamicoperations.com/api/health
# esperado: 404 (plantilla app no proxy /api)
```

**Estado proxy app:** `NOT_RUN` (host no resuelve).
