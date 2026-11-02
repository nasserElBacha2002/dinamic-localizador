# Fase 2A — Precheck

**Fecha (UTC):** 2026-11-02  
**Ejecutor:** agente local (sin SSH producción)  
**Servidor esperado (DNS público):** `170.239.85.196`

## Comandos de precheck en servidor (pendientes operador)

Ejecutar vía SSH en `/opt/dinamic-attendance/dinamic-localizador` (o ruta de deploy actual):

```bash
hostname
date -u
whoami
pwd
docker ps
docker compose ps
curl -I http://127.0.0.1:8084/
curl -I http://127.0.0.1:8084/login
```

**Gate:** si loopback `8084` no devuelve `200`, no continuar Fase 2A.

## Evidencia disponible desde fuera del servidor

| Check | Resultado | Notas |
|-------|-----------|--------|
| `dig +short dinamicoperations.com A` | `170.239.85.196` | OK |
| `dig +short api.dinamicoperations.com A` | `170.239.85.196` | OK |
| `dig +short app.dinamicoperations.com A` | *(vacío)* | **BLOCKER DNS** |
| `curl -I https://dinamicoperations.com/` | HTTP/2 200 | baseline apex |
| `curl -I https://api.dinamicoperations.com/api/health` | HTTP/2 200 | baseline API |

## Estado precheck servidor

```text
NOT_VERIFIABLE — hostname, docker, loopback 8084 no ejecutados (sin credenciales SSH en este entorno).
```

## Clasificación

- **BLOCKER:** registro DNS `app` inexistente antes de bootstrap Nginx/Certbot.
- **EXTERNAL_ACTION_REQUIRED:** precheck loopback + auditoría Nginx en host.
