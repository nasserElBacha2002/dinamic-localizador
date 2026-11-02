# SEO, sitemap, robots

## Website (marketing)

### Fuentes

- Estáticos: `website/public/sitemap.xml`, `website/public/robots.txt`.
- HTML: `website/index.html` — canonical y OpenGraph apuntan a `https://dinamicoperations.com/`.
- Runtime: `useLandingDocumentMeta.ts` — og:title, og:url desde `LANDING_SEO`.
- Contenido SEO: `website/src/content/landing-content.ts` — `canonicalUrl`.

### Sitemap

- **Una URL:** `/` con lastmod estático.
- **Generación:** archivo estático en repo, no build dinámico multi-ruta.
- Host Nginx enruta `= /sitemap.xml` al contenedor website.

### robots.txt (website)

```
Allow: /$
Allow: /sitemap.xml, /robots.txt, /brand/, /marketing-assets/
Disallow: /
Sitemap: https://dinamicoperations.com/sitemap.xml
```

**Intención:** permitir solo landing y assets de marketing; disallow resto del host.

**DEFECTO CONFIRMADO (P2):** Con arquitectura unificada, rutas app (`/login`, …) viven en el **mismo host**; robots `Disallow: /` reduce crawl pero **no garantiza** desindexación de URLs ya descubiertas; SPA sin `noindex` en HTML app puede indexarse si un crawler ignora robots o llega por enlaces externos.

### Canonical deseada post-separación

- Website: `https://dinamicoperations.com/` (sin cambio).
- Redirects recomendados:
  - `http://dinamicoperations.com/*` → HTTPS apex
  - `https://www.dinamicoperations.com/*` → `https://dinamicoperations.com/*` (301)

## App (frontend) — estado actual

- `frontend/index.html`: **sin** meta robots, **sin** canonical.
- `frontend/public/robots.txt`: **idéntico** al website (incluye Sitemap apex).
- `frontend/public/sitemap.xml`: **duplica** URL de landing en apex.
- `frontend/nginx.conf`: sirve sitemap/robots como estáticos antes del SPA fallback.

**RIESGO CONFIRMADO DE MIGRACIÓN (P1 SEO):** Si `app.*` sirve los mismos archivos, el sitemap de marketing podría exponerse en subdominio app. Tras separación, app debe tener robots **Disallow: /** sin sitemap marketing, o solo `X-Robots-Tag: noindex`.

## Tests de contrato

`website/src/seo/marketing-sitemap.test.ts`:

- Exige igualdad `frontendSitemap === sitemap` y `frontendRobots === robots`.
- Verifica Nginx host proxea sitemap/robots al website.

**DEUDA TÉCNICA (P2):** Tras separación de hosts, este test debe **dejar de exigir** paridad frontend/website y validar políticas distintas.

## App post-separación — estrategia recomendada

| Capa | Acción |
|------|--------|
| `robots.txt` en app | `User-agent: *` / `Disallow: /` (sin Sitemap) |
| HTML shell | `<meta name="robots" content="noindex, nofollow">` en `frontend/index.html` |
| Nginx app vhost | `add_header X-Robots-Tag "noindex, nofollow" always;` |
| Auth | Rutas protegidas ya no accesibles sin JWT — **no sustituye** noindex para `/login` |
| sitemap | **No** publicar sitemap en app |
| Search Console | Separar propiedades apex vs app; solicitar remoción URLs app indexadas bajo apex (proceso manual) |

## GEO / crawlers IA

**Problemas técnicos actuales:**

- Contenido marketing mezclado con centenares de rutas SPA operativas bajo un dominio — señales SEO diluidas.
- Un solo sitemap con `/` — no hay páginas de solución/FAQ estructuradas aún (solo landing).

**Cómo ayuda la separación:**

- Apex dedicado a contenido semántico estable (landing + futuras páginas).
- App excluida explícitamente de índice.
- Espacio para JSON-LD `Organization` / `SoftwareApplication` solo en website sin competir con `/operations`.

**No inventado:** estrategia de contenido marketing más allá de hooks SEO existentes.

## hreflang / JSON-LD

- **N/A** hreflang.
- JSON-LD estructurado **no** encontrado en website (solo meta OG básica).
