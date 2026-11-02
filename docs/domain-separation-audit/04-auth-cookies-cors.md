# Auth, cookies, CORS

## Autenticación

### Implementación real

- **Login:** `POST /api/auth/login` (y rutas 2FA) → JWT en respuesta → `setStoredToken` → `localStorage` key `dinamic_auth_token` (`frontend/src/api/token-storage.ts`).
- **Requests API:** interceptor axios añade `Authorization: Bearer ${token}` (`frontend/src/api/client.ts`).
- **Logout:** `POST /api/auth/logout` con Bearer; no depende de cookies.
- **Refresh token:** **no** hay endpoint `/auth/refresh` en rutas auditadas; sesión = JWT hasta expiración o 401.

### Cookies

- Búsqueda en backend: **no** hay `Set-Cookie` de sesión de usuario en servicios identity auditados.
- Implicación migración: **no** hay riesgo P0 de `Domain=dinamicoperations.com` compartido entre website y app.
- Implicación **positiva:** mover app a `app.*` **no invalida** cookies de sesión (no existen); **sí** aísla `localStorage` por origen (usuarios deberán **volver a login** en el nuevo origen — comportamiento esperado, no bug de seguridad).

### SameSite / Secure / HttpOnly

- **N/A** para sesión app (JWT en localStorage).
- CORS en `app.ts` **no** habilita `credentials: true` (default false, alineado con `cors-policy.http.test.ts`).

## CORS

### Configuración (`backend/src/app.ts` + `cors-origins.ts`)

- Orígenes permitidos: `parseCorsOrigins(NODE_ENV, FRONTEND_URL, CORS_ALLOWED_ORIGINS)`.
- Producción: si `CORS_ALLOWED_ORIGINS` está definido, **solo** esos orígenes (+ no duplica automáticamente `FRONTEND_URL` salvo que esté en la lista — ver lógica: en prod con cors string, itera split; **FRONTEND_URL no se añade solo** si CORS_ALLOWED_ORIGINS está set).

**RIESGO CONFIRMADO DE MIGRACIÓN (P1):** En producción, `docker-compose.prod.yml` **requiere** `CORS_ALLOWED_ORIGINS`. Si solo se cambia `FRONTEND_URL` pero CORS sigue listando `https://dinamicoperations.com`, el browser en `https://app.dinamicoperations.com` recibirá **CORS denegado** en preflight.

**Acción:** Actualizar **ambos** a `https://app.dinamicoperations.com` (y mantener apex en CORS solo si hay fetch browser desde website al API — hoy website no llama API: `demo-request.api.ts` disabled).

### Requests sin Origin

- `origin` vacío permitido (`callback(null, true)`) — útil para curl/Twilio/server; no sustituye CORS browser.

### Comparación API bajo app vs api subdomain

| Aspecto | `app.*` + `api.*` (actual) | `app.*` + `/api` proxy |
|---------|------------------------------|-------------------------|
| CORS | Cross-origin explícito | Same-origin app (sin CORS browser) |
| Cookies sesión | N/A JWT | N/A JWT |
| Twilio webhooks | Siguen en `api.*` | Sin cambio si webhooks quedan en api |
| Complejidad Nginx | Baja (3 vhosts) | Media (proxy + headers) |
| `VITE_API_URL` | Ya cross-origin | Podría ser `/api` relativo |

**Recomendación:** Mantener **`api.dinamicoperations.com`** — ya implementado en diseño y docs; menor riesgo que reintroducir `/api` en apex o app.

## CSRF

- API stateless Bearer: CSRF clásico cookie-session **no aplica**.
- Website estático sin sesión API: superficie baja.

## Sesiones compartidas website ↔ app

- **No** compartidas (localStorage por origen; website no embebe app).
- CTA `/login` relativo hoy lleva al **mismo origen** apex; tras separación debe ser URL absoluta a `app.*`.

## Tests existentes

- `cors-policy.http.test.ts` — allowlist boundary.
- `cors-origins.test.ts` — loopback alias dev.
- `password-reset-email.test.ts`, `invitation-email.test.ts` — `FRONTEND_URL`.

## Tests recomendados pre-migración

- HTTP test: Origin `https://app.dinamicoperations.com` permitido con env prod simulado.
- E2E manual/script: login en `app.*`, llamada `/api/auth/me`, logout.
