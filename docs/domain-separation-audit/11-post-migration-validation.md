# Post-migration validation checklist

Ejecutar en orden; marcar pass/fail con evidencia (curl, captura, log).

## Website (`https://dinamicoperations.com`)

- [ ] `/` — 200, contenido marketing, canonical apex
- [ ] `/robots.txt` — Allow landing, Disallow resto, Sitemap apex
- [ ] `/sitemap.xml` — solo URLs públicas apex
- [ ] `/marketing-assets/*` — 200 cache headers
- [ ] HTTP → HTTPS apex 301
- [ ] `www` → apex 301 (si DNS www existe)
- [ ] `/login` — **301** a `app.*/login` (post cutover), no SPA app en apex
- [ ] 404 en ruta inventada — respuesta website o Nginx 404 coherente

## App (`https://app.dinamicoperations.com`)

- [ ] `/login` — 200 SPA
- [ ] Login email/password — token en localStorage, redirect dashboard
- [ ] Logout — token cleared, redirect login
- [ ] Reload deep link `/operations/123` — SPA routing OK
- [ ] `/robots.txt` — Disallow all (sin sitemap marketing)
- [ ] Header or meta `noindex` presente
- [ ] `/sitemap.xml` — 404 o noindex policy (no listing apex)
- [ ] `/api/health` — **no** debe existir en app host (404 o nginx block)

## API (`https://api.dinamicoperations.com`)

- [ ] `/api/health` — 200 JSON
- [ ] CORS: Origin `https://app.dinamicoperations.com` + credenciales off + Bearer request OK
- [ ] CORS: Origin `https://dinamicoperations.com` — denegado si website no llama API

## Auth flows

- [ ] Forgot password email link host = `app.*`
- [ ] Invitation accept link host = `app.*`
- [ ] Reset password token query preserved
- [ ] 2FA login completo
- [ ] Admin alert WhatsApp link (staging) apunta `app.*/absences/...`

## Integraciones

- [ ] Twilio inbound webhook 200/403 signature (Twilio debugger)
- [ ] Twilio status callback si enabled
- [ ] Google Maps carga en formulario tiendas (sin RefererNotAllowedMapError)
- [ ] SMTP envío invitación en entorno de prueba

## SEO

- [ ] Search Console sitemap apex único
- [ ] No URLs `app.*` en sitemap apex
- [ ] Inspección URL landing indexable
- [ ] Inspección URL `app.*/login` — noindex / excluded

## Performance / headers

- [ ] TLS grade aceptable (servidor)
- [ ] `Referrer-Policy: no-referrer` en app (existente)

## Monitoring (48h)

- [ ] Nginx 5xx rate por vhost
- [ ] Backend 401 spike post cutover
- [ ] Twilio error webhooks

## Tests automatizados recomendados (repo)

- [ ] `website` — npm test (SEO tests actualizados)
- [ ] `backend` — `cors-policy.http.test.ts` + casos app origin
- [ ] `quality-gate` verde en branch de migración
