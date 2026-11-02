# Phase 1 validation checklist

## Criterios de aceptación (repo)

- [x] Plantilla Nginx app HTTPS + bootstrap
- [x] Apex objetivo sin catch-all a frontend (solo website + redirects)
- [x] Redirects legacy selectivos documentados e inline
- [x] Website CTA vía `VITE_OPERATIONS_APP_URL` (CI + docs)
- [x] App noindex + robots Disallow + sin sitemap marketing
- [x] Tests SEO separados
- [x] CORS app origin tests
- [x] Email/admin URL tests con FRONTEND_URL app
- [x] Doc Twilio paths corregidos
- [x] Google Maps referrer en cutover doc
- [x] Dev local documentado (localhost ports)
- [x] Build frontend / website PASS
- [x] Tests relevantes PASS
- [x] No producción tocada

## Manual smoke (post Fase 2 — fuera de alcance ahora)

Ver `docs/domain-separation-audit/11-post-migration-validation.md`.
