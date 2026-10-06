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

Metadata principal en `index.html`. `useLandingDocumentMeta` puede complementar en runtime; para OG/canonical avanzados evaluar SSR/SSG en una iteración futura.
