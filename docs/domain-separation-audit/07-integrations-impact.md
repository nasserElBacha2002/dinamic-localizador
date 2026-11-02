# Integrations impact

## Twilio / WhatsApp

### Webhooks (backend URL — no cambian con frontend host)

| Env | Path real (código) | Router |
|-----|-------------------|--------|
| `TWILIO_WEBHOOK_URL` | debe terminar en `/api/webhooks/twilio/whatsapp` | `twilio.routes.ts` POST `/whatsapp` |
| `TWILIO_STATUS_CALLBACK_URL` | `/api/webhooks/twilio/whatsapp/status` | POST `/whatsapp/status` |

- Firma validada contra **env URL**, no `Host` del request (`app.ts` comment, tests integración).
- **Migración frontend → app.*:** **sin cambio** si API sigue en `api.dinamicoperations.com`.

**DEUDA TÉCNICA (P3):** `docs/production-domain-cutover.md` menciona path incorrecto `/api/whatsapp/webhook` — riesgo operativo al configurar Twilio.

### Mensajes al usuario

- Bot WhatsApp envía texto/TwiML; **no** se encontraron URLs hardcodeadas a `dinamicoperations.com` en servicios twilio outbound auditados (grep acotado).
- Plantillas admin (`absenceDetailUrl`, etc.) usan **`FRONTEND_URL`** → deben apuntar a **`app.*`** tras migración.

## Email (SMTP)

| Flujo | URL base | Destino post-migración |
|-------|----------|------------------------|
| Invitación | `{FRONTEND_URL}/invitations/accept?token=` | `app.*` |
| Reset password | `{FRONTEND_URL}/reset-password?token=` | `app.*` |
| Reportes / workers | SMTP attachments — revisar templates individuales | mayoría sin link web |

## Google Maps

- Frontend carga Maps JS con `VITE_GOOGLE_MAPS_API_KEY`.
- README: restricción por **HTTP referrer**.
- **CAMBIO EXTERNO:** Google Cloud Console — añadir `https://app.dinamicoperations.com/*`; eventualmente quitar apex si app deja de cargar maps allí.

## GCP (adjuntos ausencias)

- ADC / service account — **no** depende de dominio frontend.

## GitHub Actions / GHCR

- Deploy SSH — no depende de dominio público salvo health URLs (`DEPLOY_*_HEALTH_URL` en loopback).

## Website demo lead

- `isDemoSubmitEnabled = false` — sin API pública aún.

---

## CAMBIOS EXTERNOS NO RESOLVIBLES SOLO CON CÓDIGO

| Sistema | Acción |
|---------|--------|
| DNS Hostinger (o proveedor) | Registro `app` A/CNAME |
| Let's Encrypt / Certbot | Certificado `app.dinamicoperations.com` |
| Nginx en servidor | Nuevo site + modificar apex (quitar proxy app) |
| `.env` producción en servidor | `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, opcional `VITE_*` rebuild |
| GitHub `vars` / secrets | `VITE_OPERATIONS_APP_URL`, verificar `VITE_API_URL` |
| Twilio Console | Confirmar webhook URLs en `api.*` (paths exactos) |
| Google Cloud API keys | Referrer `app.dinamicoperations.com` |
| Google Search Console | Redirects, remoción URLs, sitemap apex |
| Bookmarks / emails ya enviados | Redirects 301 apex → app |
| Legacy dominios | `tracker.dinamiceducation.com` redirects según cutover doc |

## OAuth providers

- **N/A** login social.

## Meta WhatsApp

- No restos auditados en grep de callbacks Meta; canal productivo Twilio.

## Storage / signed URLs

- Adjuntos usan GCP; URLs firmadas — **NO VERIFICABLE** si incluyen dominio custom (revisar servicio attachments en implementación futura).
