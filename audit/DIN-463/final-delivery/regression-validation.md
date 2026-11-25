# Regression validation — DIN-463 final

## Commands

| Command | Exit | pass | fail | skip |
|---------|------|------|------|------|
| `npm run build` | 0 | — | — | — |
| `npm test` (unit) | 0 | 2356 | 0 | 0 |
| `npm run test:integration` | 0 | 884 | 0 | 0 |
| `npm run lint` | 1 | — | 41 errors | — |

## Scope covered by full integration (PASS)

Includes existing suites for employees, imports, deactivations, assignments, operations, attendance, billing subscriptions/exemptions, company settings, multi-tenant HTTP guards, connection pool behavior under load (within suite design).

## DISABLED default behavior

Integration orchestrator exported `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE=DISABLED` for the full run — operational paths behave as pre-DIN-463 enforcement-off unless a test mutates `env`.

## Out of scope (unchanged)

- Frontend
- WhatsApp bot flows
- DIN-464

## Lint

41 ESLint errors pre-existing in unrelated modules; **no** errors in `commercial-seat-quota.service.ts` / `employee.service.ts` when linted in isolation in prior pass.