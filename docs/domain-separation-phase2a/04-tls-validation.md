# Fase 2A — TLS / Certbot (`app.dinamicoperations.com`)

## Pre-requisitos

1. DNS `app` resuelve al servidor.
2. Bootstrap HTTP app responde en puerto 80 (Certbot HTTP-01 / plugin nginx).

## Comandos (operador)

Antes de emitir:

```bash
sudo certbot certificates
```

Emitir **solo** para app (adaptar al método ya usado en el servidor):

```bash
sudo certbot certonly --nginx -d app.dinamicoperations.com
```

**No** renovar ni reemplazar certificados de `dinamicoperations.com` / `api.dinamicoperations.com` sin necesidad.

## Verificación post-emisión

```bash
sudo certbot certificates
# debe listar app.dinamicoperations.com

sudo test -f /etc/letsencrypt/live/app.dinamicoperations.com/fullchain.pem && echo OK
sudo test -f /etc/letsencrypt/live/app.dinamicoperations.com/privkey.pem && echo OK
```

Si Certbot crea lineage `app.dinamicoperations.com-0001`, ajustar paths en la plantilla HTTPS renderizada — **no** usar paths incorrectos.

```bash
openssl s_client -connect app.dinamicoperations.com:443 \
  -servername app.dinamicoperations.com </dev/null
# verify return code: 0; SAN incluye app.dinamicoperations.com
```

## Evidencia desde entorno agente (2026-11-02)

```text
openssl s_client -connect app.dinamicoperations.com:443 ...
BIO_lookup_ex: nodename nor servname provided, or not known
```

**Causa:** sin registro DNS `app.*` — Certbot y TLS no ejecutables.

## Estado

```text
NOT_APPLIED
```
