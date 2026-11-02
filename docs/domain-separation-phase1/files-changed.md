# Files changed — Phase 1

| Path | Reason |
|------|--------|
| `deploy/nginx.app.dinamicoperations.com.conf.template` | Nuevo vhost HTTPS app |
| `deploy/nginx.bootstrap.app.dinamicoperations.com.conf.template` | Bootstrap HTTP app |
| `deploy/nginx.dinamicoperations.com.conf.template` | Apex solo website + redirects legacy |
| `deploy/nginx.bootstrap.dinamicoperations.com.conf.template` | Bootstrap apex alineado |
| `deploy/nginx.bootstrap.dinamicoperations.com.legacy-unified.conf.template` | Rollback bootstrap unificado |
| `deploy/nginx.dinamicoperations.com.legacy-unified.conf.template` | Rollback HTTPS unificado |
| `frontend/index.html` | meta robots noindex |
| `frontend/public/robots.txt` | Política app |
| `frontend/public/sitemap.xml` | **Eliminado** |
| `frontend/nginx.conf` | 404 sitemap, X-Robots-Tag |
| `website/src/seo/marketing-sitemap.test.ts` | Tests SEO separados |
| `website/src/config/operations-app-url.test.ts` | CTA app subdomain |
| `website/.env.example`, `website/README.md` | Documentación CTA |
| `.github/workflows/deploy-website.yml` | Var `VITE_OPERATIONS_APP_URL` |
| `.env.example`, `backend/.env.example` | Valores objetivo comentados |
| `backend/src/config/cors-*.test.ts` | Cobertura app origin |
| `backend/src/services/identity/*-email.test.ts` | URLs app + tokens |
| `backend/src/utils/admin-alert/absence-request-admin-url.test.ts` | Deep link admin |
| `docs/production-domain-cutover.md` | Runbook separación dominios |
