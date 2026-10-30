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

Hay un solo `sitemap.xml` y un solo `robots.txt` para el dominio. Viven en este proyecto; Vite los copia a `dist`. El Nginx del host tiene que proxear `/sitemap.xml` y `/robots.txt` al website (como ya hace con `/`), porque el catch-all del mismo dominio va a la app. Ver `deploy/nginx.dinamicoperations.com.conf.template`.
