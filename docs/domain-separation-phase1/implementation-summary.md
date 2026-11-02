# Domain separation — Phase 1 implementation summary

## Qué se cambió y por qué

Fase 1 prepara el repositorio para la arquitectura **apex = website**, **app.\* = frontend**, **api.\* = backend**, sin ejecutar cutover en producción.

### NGINX TEMPLATES

- Nuevas plantillas `deploy/nginx.app.dinamicoperations.com.conf.template` y bootstrap HTTP homólogo.
- Plantillas apex objetivo dejan de proxear frontend; redirects inline documentados en `production-domain-cutover.md`.
- Plantillas **legacy-unified** para rollback (`*.legacy-unified.conf.template`).
- Resuelve hallazgos DS-008, DS-009, DS-015 de la auditoría.

### SEO

- App: `noindex` en `frontend/index.html`, `robots.txt` con `Disallow: /`, eliminación de `frontend/public/sitemap.xml`, `frontend/nginx.conf` con `404` en `/sitemap.xml` y `X-Robots-Tag`.
- Website: sin cambios de contenido SEO (sitemap sigue solo `/` en apex).
- Resuelve DS-010, DS-011, DS-025.

### TESTS

- `marketing-sitemap.test.ts`: políticas separadas website vs app + contratos Nginx.
- CORS: origen `https://app.dinamicoperations.com` permitido; apex rechazado cuando solo app está allowlisted.
- Emails/admin URLs con `FRONTEND_URL` app subdomain y tokens preservados.
- Resuelve DS-012, DS-001, DS-005–DS-007.

### DOCUMENTATION

- `docs/production-domain-cutover.md` reescrito para arquitectura separada, paths Twilio correctos, Google Maps referrer, orden de cutover.
- `.env.example` (raíz, backend, website), `website/README.md`.
- Resuelve DS-013, DS-014 (doc).

### CI/CD

- `deploy-website.yml` pasa `VITE_OPERATIONS_APP_URL` desde GitHub `vars` (vacío = comportamiento pre-cutover `/login` relativo).

### CODE

- Sin cambios de auth (JWT/localStorage).
- Sin hardcode de URLs en componentes React; se usa `VITE_OPERATIONS_APP_URL` / `FRONTEND_URL`.

## Deliberadamente fuera de alcance

- DNS, Certbot, Nginx en servidor, `.env` producción, Twilio Console, GCP Console, Search Console.
- Fase 2 infraestructura y activación de plantillas apex en producción.

## Corrección de auditoría

- Confirmado: en producción con `CORS_ALLOWED_ORIGINS` definido, `FRONTEND_URL` no se añade solo — deben alinearse ambos en cutover (ya documentado).
