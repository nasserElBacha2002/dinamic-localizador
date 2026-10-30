# Dinamic Operations Website

Sitio comercial (landing) independiente del frontend operativo (`../frontend`).

## Dominios objetivo (referencia)

- `https://dinamicoperations.com/` → website (este proyecto)
- `https://dinamicoperations.com/login` (y resto de rutas app) → `../frontend`
- `https://api.dinamicoperations.com` → `../backend`

Cutover operativo: [docs/production-domain-cutover.md](../docs/production-domain-cutover.md)

## Desarrollo

```bash
npm install
npm run dev
```

Puerto por defecto: **8085**.

## Variables

Ver `.env.example`. Por defecto el CTA **Ingresar** apunta a `/login` (mismo dominio). `VITE_OPERATIONS_APP_URL` es opcional para desarrollo con app en otro puerto.

## SEO

Metadata principal en `index.html` (title, description, canonical, og:url). `useLandingDocumentMeta` puede complementar en runtime.

Archivos estáticos para Google Search Console:

- `https://dinamicoperations.com/sitemap.xml`
- `https://dinamicoperations.com/robots.txt`

Hay un solo par de URLs de dominio: `https://dinamicoperations.com/sitemap.xml` y `/robots.txt`. El catch-all del host manda todo lo que no es `/` a la app, así que esos archivos también están en `frontend/public/` (y el Nginx de la app los sirve como estáticos, sin caer en la SPA). Las copias de este proyecto quedan alineadas para cuando el Nginx del host proxee esas rutas al website.
