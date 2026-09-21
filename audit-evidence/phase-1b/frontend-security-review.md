# Frontend security review

| Check | Result |
|-------|--------|
| `dangerouslySetInnerHTML` / `innerHTML` / `document.write` | None in product `frontend/src` |
| JWT storage | `localStorage` key `dinamic_auth_token` (`token-storage.ts`) — CQ-004 |
| Active company | `localStorage` — UI selection only; BE membership enforced |
| AuthZ UI | `FeatureRouteGuard` — BE still authoritative; one FE-stricter case (users list) |

XSS sink surface clean; token storage amplifies future XSS (pairs with LOC-P1-015 no logout).
