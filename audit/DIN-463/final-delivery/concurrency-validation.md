# Concurrency validation — DIN-463 final

**Run:** `npm run test:integration` — exit **0**, 884 pass (2026-11-25).

## Executed (dedicated)

| Scenario | Status | Evidence |
|----------|--------|----------|
| Alta vs alta disputando último cupo (`seat_max=1`, ENFORCE) | **PASS** | `commercial-seat-quota.concurrency.integration.test.ts` — exactly one success, one `COMMERCIAL_SEAT_LIMIT_EXCEEDED`, active count = 1 |

## NOT_EXECUTED (sin suite dedicada)

| Scenario | Status |
|----------|--------|
| Alta vs reactivación | NOT_EXECUTED |
| Reactivación vs reactivación | NOT_EXECUTED |
| Alta vs importación | NOT_EXECUTED |
| Importación vs importación | NOT_EXECUTED |
| Desactivación concurrente con reactivación | NOT_EXECUTED |
| Cambio contractual concurrente con admisión | NOT_EXECUTED |
| Cambio de exención concurrente con admisión | NOT_EXECUTED |
| Cambio de modo concurrente con admisión | NOT_EXECUTED |
| Dos admins configuración comercial simultánea | NOT_EXECUTED |
| Operaciones concurrentes entre empresas (cupos) | NOT_EXECUTED (suite multi-tenant general pasa en regresión global; sin assert de cupo) |
| Pool de conexiones limitado (cupos) | NOT_EXECUTED |

## Regression note

General SQL concurrency tests (absence, attendance, billing admin, etc.) ran in the full integration run without failures; they do **not** substitute for the commercial-seat matrix above.