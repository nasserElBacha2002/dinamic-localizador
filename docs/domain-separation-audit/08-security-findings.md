# Security findings

Severidad: P0 crítico | P1 bloquea migración | P2 degradación | P3 deuda

## Cookies y wildcard domains

| Hallazgo | Clasificación | Sev |
|----------|---------------|-----|
| No hay cookies de sesión app | NO aplica wildcard | — |
| JWT en localStorage expuesto a XSS en app origin | DEUDA TÉCNICA existente | P2 |
| Recomendar `*.dinamicoperations.com` en cookies | **No recomendado** — no hay caso de uso | — |

## CORS

| Hallazgo | Clasificación | Sev |
|----------|---------------|-----|
| Allowlist explícita, no `*` en prod | OK | — |
| Prod con `CORS_ALLOWED_ORIGINS` obligatorio no fusiona auto `FRONTEND_URL` | RIESGO CONFIRMADO DE MIGRACIÓN | P1 |
| Requests sin Origin permitidos | RIESGO PROBABLE — útil para server; no abrir a browser | P3 |

## CSRF

- Bearer token: riesgo CSRF cookie **bajo** para API.
- Website sin formularios POST al API: **bajo**.

## CSP / Helmet

- `helmet()` default en backend (referrer no-referrer).
- Frontend: **no** CSP estricta auditada en `index.html`.
- Separación no empeora CSP; oportunidad de CSP distinta website vs app (recomendado no bloqueante).

## Clickjacking

- No `X-Frame-Options` / `frame-ancestors` custom auditados en Nginx plantillas.
- DEUDA TÉCNICA P3.

## Subdomain takeover

- Crear DNS `app` apuntando a IP controlada — asegurar registro antes de publicar enlaces.
- RIESGO PROBABLE si se anuncia `app.*` antes de DNS.

## Exposición de rutas

| Hallazgo | Clasificación | Sev |
|----------|---------------|-----|
| App en apex expone `/login`, `/platform/*` bajo mismo host que marketing | DEFECTO CONFIRMADO (superficie) | P2 |
| Mover a `app.*` reduce confusión y enlaces cruzados SEO | Mitigación | — |

## Assets

- `/assets/` (app) vs `/marketing-assets/` (site) — colisión resuelta en Nginx actual.
- En `app.*` solo `/assets/` app — OK.

## Auth redirects

- Invitación/reset dependen de `FRONTEND_URL` — enlaces falsos si env desactualizado (phishing UX, no bypass auth).
- RIESGO CONFIRMADO DE MIGRACIÓN P1.

## API separation

- Mantener API en `api.*` aísla webhooks y reduce ataque surface en apex (sin `/api` en marketing host — ya 404).

## Secrets in repo

- No secrets de prod en plantillas Nginx (paths cert only).
- OK.

## Wildcard CORS / CSP

- **Evitar** `Access-Control-Allow-Origin: *` con credentials — no aplica hoy.
- **Evitar** `Domain=.dinamicoperations.com` cookies salvo requisito futuro explícito.
