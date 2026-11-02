# Fase 2A — Resumen de ejecución

## Objetivo

Habilitar `https://app.dinamicoperations.com` (DNS → bootstrap → Certbot → HTTPS → SPA smoke) **sin** modificar routing del apex.

## Resultado de esta ejecución (agente / evidencia pública)

| Criterio aceptación | Estado |
|---------------------|--------|
| DNS `app.*` → servidor | **FAIL** — sin registro A |
| Frontend loopback 8084 healthy | **NOT_VERIFIABLE** (sin SSH) |
| Nginx bootstrap app sin tocar apex | **NOT_APPLIED** |
| `nginx -t` PASS | **NOT_RUN** |
| HTTP app responde | **NOT_RUN** (NXDOMAIN) |
| Certificado TLS app | **NOT_APPLIED** |
| HTTPS final app | **NOT_APPLIED** |
| Smoke HTTPS SPA | **NOT_RUN** |
| `/api/*` en app → 404 | **NOT_RUN** |
| API `api.*` health | **PASS** (baseline) |
| Apex sin cambio / login sin redirect app | **PASS** (baseline) |
| Backend env / CORS / Twilio / DB | **NOT_MODIFIED** |

## Bloqueador principal

1. Crear registro DNS `A` `app` → `170.239.85.196` (misma IP que apex/api verificada 2026-11-02).
2. Ejecutar runbook SSH: precheck → bootstrap → HTTP smoke → Certbot → HTTPS → smokes → re-validar apex.

## Próximos pasos operativos (orden)

1. [02-dns-validation.md](./02-dns-validation.md) — crear registro `app`.
2. [01-precheck.md](./01-precheck.md) — loopback 8084 en servidor.
3. [03-nginx-bootstrap.md](./03-nginx-bootstrap.md) — bootstrap HTTP.
4. [04-tls-validation.md](./04-tls-validation.md) — Certbot app only.
5. Instalar HTTPS final (`nginx.app.*` template).
6. [05-https-smoke-tests.md](./05-https-smoke-tests.md) + [06-apex-regression-check.md](./06-apex-regression-check.md).

## Fase 2B / 2C

No iniciadas. Ver [production-domain-cutover.md](../production-domain-cutover.md).

## Checklist aceptación completo

Ver sección 27 del runbook operativo — marcar ítems solo tras evidencia en servidor.
