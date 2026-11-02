# Remaining external actions (post Phase 1)

No ejecutadas en esta fase — requieren ventana operativa manual.

## DNS / TLS

- [ ] Registro `A` (o CNAME) `app.dinamicoperations.com` → IP servidor
- [ ] Certbot: certificado `app.dinamicoperations.com`
- [ ] Instalar sites-enabled: bootstrap → HTTPS final app

## Nginx (servidor)

- [ ] Instalar `nginx.app.*` y validar `https://app.dinamicoperations.com/login`
- [ ] Solo después: instalar plantilla apex **solo website** con `APP_PUBLIC_ORIGIN`
- [ ] `nginx -t` + reload

## Producción env (servidor + GitHub)

- [ ] `FRONTEND_URL=https://app.dinamicoperations.com`
- [ ] `CORS_ALLOWED_ORIGINS=https://app.dinamicoperations.com`
- [ ] GitHub var `VITE_OPERATIONS_APP_URL=https://app.dinamicoperations.com` + redeploy website
- [ ] Verificar `VITE_API_URL=https://api.dinamicoperations.com/api` + redeploy frontend
- [ ] Redeploy backend tras cambio env

## Twilio Console

- [ ] Verificar (sin cambiar host):  
  `TWILIO_WEBHOOK_URL=https://api.dinamicoperations.com/api/webhooks/twilio/whatsapp`  
  `TWILIO_STATUS_CALLBACK_URL=https://api.dinamicoperations.com/api/webhooks/twilio/whatsapp/status`

## Google Cloud

- [ ] HTTP referrer `https://app.dinamicoperations.com/*` en clave Maps usada por `VITE_GOOGLE_MAPS_API_KEY`

## Search Console / SEO ops

- [ ] Sitemap solo apex
- [ ] Monitoreo desindexación URLs app bajo apex legacy

## Compatibilidad pre-cutover

Mientras el servidor siga con Nginx **unificado legacy** (no las plantillas nuevas del repo), la producción actual no cambia. **Instalar la plantilla apex nueva sin app host listo romperá `/login`** hasta que redirects y `app.*` respondan.
