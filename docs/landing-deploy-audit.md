# Landing + Attendance Unified Deployment Audit

**Última actualización:** 2026-10-06 — implementación Fases 1–2 (website deploy) completada en repo. Cutover de dominio: ver [production-domain-cutover.md](./production-domain-cutover.md).

## Estado de implementación (repo)

| Ítem | Estado |
|------|--------|
| `website` en quality-gate | Hecho |
| `build.assetsDir: marketing-assets` | Hecho |
| CTA `/login` relativo | Hecho |
| `website/Dockerfile` + `nginx.conf` | Hecho |
| Servicio `website` en Compose prod (`127.0.0.1:8085`) | Hecho |
| GHCR + `deploy-website.yml` + `deploy-website.sh` | Hecho |
| Plantillas Nginx bootstrap HTTP + HTTPS final | Hecho (`deploy/nginx.bootstrap.*`, `deploy/nginx.*.dinamicoperations.com.conf.template`) |
| `deploy-website.sh` bootstrap `WEBSITE_HOST_PORT` | Hecho (default 8085 en `.env` si falta) |

### `website/package-lock.json`

El lock en `develop` estaba **desincronizado** con `package.json` (`npm ci` fallaba en local y en Docker). Se regeneró con `npm install` en `website/` **sin cambiar** `package.json` (resolución npm 11 / árbol eslint→ajv). Debe permanecer en el PR del website deploy.
| Nginx host aplicado en servidor | **Pendiente manual** |
| DNS / SSL / env prod / Twilio | **Pendiente manual** |
| Backend build en GHCR | **Fuera de alcance** (fase posterior) |

## Arquitectura final objetivo

Ver diagrama y fases en [production-domain-cutover.md](./production-domain-cutover.md).

## Hallazgos originales (resumen)

- Frontend: imagen GHCR; backend: build en servidor.
- Colisión `/assets/` resuelta en website con `marketing-assets/`.
- Dominios legacy: `tracker.dinamiceducation.com`, `api-tracker.dinamiceducation.com` — mantener hasta validación.
- No hay referencias hardcodeadas a dominios legacy en código de aplicación.

## Rollback

Documentado en [production-domain-cutover.md](./production-domain-cutover.md#rollback).
