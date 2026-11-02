# Dinamic Operations Website

Sitio comercial (landing) independiente del frontend operativo (`../frontend`).

## Dominios objetivo (separación website / app)

- `https://dinamicoperations.com/` → website (este proyecto) y SEO público
- `https://app.dinamicoperations.com/` → aplicación operativa (`../frontend`)
- `https://api.dinamicoperations.com` → backend / API / webhooks Twilio

Preparación en repo: [docs/domain-separation-phase1/](../docs/domain-separation-phase1/).  
Cutover operativo: [docs/production-domain-cutover.md](../docs/production-domain-cutover.md)

## Desarrollo

```bash
npm install
npm run dev
```

Puerto por defecto: **8085**.

## Variables

Ver `.env.example`. El CTA **Ingresar** usa `getOperationsLoginUrl()`:

- Sin `VITE_OPERATIONS_APP_URL` → enlace relativo `/login` (compatibilidad pre-cutover en el mismo host).
- Con `VITE_OPERATIONS_APP_URL` → enlace absoluto a la app (p. ej. `http://localhost:8084/login` en local o `https://app.dinamicoperations.com/login` en producción).

En CI, la variable proviene de GitHub **`vars.VITE_OPERATIONS_APP_URL`** (configurar en el cutover; vacío mantiene `/login` relativo).

## SEO

Metadata principal en `index.html` (title, description, canonical, og:url). `useLandingDocumentMeta` complementa en runtime.

Archivos públicos solo en este proyecto:

- `https://dinamicoperations.com/sitemap.xml`
- `https://dinamicoperations.com/robots.txt`

La app operativa tiene política SEO distinta (`noindex`, sin sitemap de marketing). Ver auditoría en `docs/domain-separation-audit/`.
