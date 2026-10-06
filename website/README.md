# Dinamic Operations Website

Sitio comercial (landing) independiente del frontend operativo (`../frontend`).

## Dominios objetivo (referencia)

- `dinamicoperations.com` → website (este proyecto)
- `app.dinamicoperations.com` → Operations App (`../frontend`)

## Desarrollo

```bash
npm install
npm run dev
```

Puerto por defecto: **8085**.

## Variables

Ver `.env.example`. `VITE_OPERATIONS_APP_URL` define el enlace “Ingresar” / “Acceso clientes” hacia la app operativa.

## SEO

Metadata principal en `index.html`. `useLandingDocumentMeta` puede complementar en runtime; para OG/canonical avanzados evaluar SSR/SSG en una iteración futura.
