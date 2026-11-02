# Executive summary — domain separation audit

**Stage audited:** Migración de arquitectura `dinamicoperations.com` (website + app unificados) → website en apex + app en `app.dinamicoperations.com` (API ya en `api.dinamicoperations.com`).

**Audit status (repo):** `IMPLEMENTED_WITH_ISSUES` hacia arquitectura unificada actual; objetivo de separación **no implementado** pero **parcialmente preparado** en código (p. ej. `VITE_OPERATIONS_APP_URL`, documentación de cutover).

**Overall migration readiness:** `READY_WITH_REQUIRED_FIXES` (ver `domain-separation-status.txt`).

## Summary

- Hoy **un solo host** (`dinamicoperations.com`) enruta `/` → website (`127.0.0.1:8085`) y **cualquier otra ruta** → frontend app (`127.0.0.1:8084`) vía plantillas en `deploy/nginx.dinamicoperations.com.conf.template`.
- La **API ya está separada** en `api.dinamicoperations.com` → backend; el frontend consume la API por **`VITE_API_URL` en build time** (cross-origin), no por `/api` en el apex (Nginx devuelve **404** en `location /api/` del host principal).
- Autenticación: **JWT en `localStorage`** (`dinamic_auth_token`), header `Authorization: Bearer`; **no hay cookies de sesión** ni refresh-token HTTP en el código auditado → la migración a subdominio app **no rompe cookies**, pero **sí exige CORS + env + enlaces absolutos**.
- **Bloqueantes confirmados:** actualizar producción `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, build del website con `VITE_OPERATIONS_APP_URL=https://app.dinamicoperations.com`, **nueva plantilla Nginx + DNS/TLS para `app`**, redirects 301 desde rutas app legacy en apex, política SEO distinta en app (no reutilizar sitemap/robots de marketing).
- **API:** mantener **`api.dinamicoperations.com`** (Alternativa B ya desplegada en diseño) es **menor riesgo** que proxy `/api` bajo `app.*` (menos superficie CORS/cookies, webhooks Twilio ya acoplados al host API).
- **No verificable desde repo:** estado real del `.env` de producción, consola Twilio, Google Cloud referrer de Maps, DNS/TLS en Hostinger, Nginx aplicado en servidor.

## ¿Es seguro mover hoy el frontend a `app.dinamicoperations.com`?

**Respuesta:** `SI, CON CORRECCIONES PREVIAS`

**Justificación:** El stack ya asume API en subdominio distinto y auth por Bearer token; la migración es viable pero **fallará en producción** si solo se cambia DNS/Nginx sin actualizar CORS, `FRONTEND_URL`, CTAs del website, plantillas Nginx de `app`, redirects legacy y restricciones de Google Maps.

### Bloqueantes

- Ausencia de plantilla Nginx (y certificado) para `app.dinamicoperations.com` en `deploy/`.
- `FRONTEND_URL` y `CORS_ALLOWED_ORIGINS` en backend de producción siguen documentados/apuntando al apex unificado (`docs/production-domain-cutover.md`).
- Website CI fija `VITE_OPERATIONS_APP_URL=` vacío → CTA **Ingresar** sigue siendo `/login` en el mismo host (`deploy-website.yml`).
- Emails y alertas admin construyen URLs con `FRONTEND_URL` (`invitation-email.ts`, `password-reset-email.ts`, `absence-request-admin-url.ts`).

### Cambios obligatorios antes de migrar

- DNS A/CNAME `app` + Certbot `-d app.dinamicoperations.com`.
- Nginx: host apex **solo website**; host `app` **solo frontend**; mantener `api` como hoy.
- Backend env: `FRONTEND_URL=https://app.dinamicoperations.com`, `CORS_ALLOWED_ORIGINS` incluyendo ese origen (y apex solo si algún flujo browser lo requiere).
- Rebuild website con `VITE_OPERATIONS_APP_URL=https://app.dinamicoperations.com`.
- Rebuild frontend (si cambia `VITE_API_URL` — normalmente no si API ya en `api.*`).
- Redirects 301 selectivos `https://dinamicoperations.com/login` → `https://app.dinamicoperations.com/login` (y rutas app críticas documentadas en §16 del informe).
- App: `robots.txt` / meta `noindex` / `X-Robots-Tag`; **eliminar o corregir** `frontend/public/sitemap.xml` que declara el apex de marketing.

### Cambios recomendados (no bloqueantes)

- Corregir doc operativa: path Twilio en `production-domain-cutover.md` (`/api/webhooks/twilio/whatsapp`, no `/api/whatsapp/webhook`).
- JSON-LD / páginas de solución en website cuando exista roadmap de contenido.
- Tests de contrato post-separación (CORS, redirects, sitemap solo en website).
- Retirar duplicación sitemap/robots en frontend una vez Nginx deje de servir app en apex.

### Configuración externa a revisar manualmente

- Twilio Console: `TWILIO_WEBHOOK_URL`, `TWILIO_STATUS_CALLBACK_URL` (deben seguir en `api.*`; validar paths exactos).
- Google Cloud: restricciones HTTP referrer de `VITE_GOOGLE_MAPS_API_KEY` para `https://app.dinamicoperations.com/*`.
- GitHub Actions `vars`: `VITE_API_URL`, nuevas vars para website app URL.
- Servidor: `.env` real, Nginx sites-enabled, certificados Let's Encrypt, legacy `tracker.dinamiceducation.com`.

## Suggested next command

- `/implement-dinamic-stage` — solo tras aprobar el plan en `09-migration-plan.md` y checklist de `11-post-migration-validation.md`.
