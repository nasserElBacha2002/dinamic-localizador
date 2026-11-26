# Commercial policy validation (DIN-463 corrections)

## Matrix

Unit-tested in `resolve-effective-commercial-seat-mode.test.ts` (global × company).

## Runtime

- Global mode from validated `env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE` (default `DISABLED`).
- Company `ENFORCE` rejected unless global `ENFORCE` (`commercial-seat-quota-settings.service.ts`).

## Integration policy matrix (spec §10)

| Scenario | Status |
|----------|--------|
| DISABLED default | build + unit |
| ENFORCE finite / no subscription / OBSERVE | **integration skipped** |
| Exemptions | code path in service; **not SQL-tested** |

## Effective ENFORCE in deploy

**OFF** — default and docker-compose remain `DISABLED`.