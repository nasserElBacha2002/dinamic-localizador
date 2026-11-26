# DIN-463 — Implementation report

**Status:** `IMPLEMENTED_PENDING_VALIDATION`

## Summary

- Centralized commercial seat quota in `commercial-seat-quota.service.ts` with DIN-463 mode matrix, billing capacity resolution, and autonomous event ledger.
- Hooks on `employeeService.create`, `createManyForImport`, and reactivation via `update`; lock `commercial-seat:{companyId}`.
- Migration `175_commercial_seat_quota.sql`; platform-admin API for company mode; global `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE` default `DISABLED`.
- `seed-employees.ts` gated with `EMPLOYEE_LEGACY_SEED_ALLOWED` and global DISABLED.

## Behavioral changes

- ENFORCE (global + company): HTTP 409 `COMMERCIAL_SEAT_LIMIT_EXCEEDED` when projected active headcount exceeds contractual `seat_max`.
- OBSERVE: allows mutation; logs `WOULD_EXCEED` / `INCONSISTENCY` / `ALLOWED`.
- Missing subscription/term: allows mutation; logs inconsistency (no ENFORCE block).
- No change to attendance, assignments, WhatsApp, or automatic suspensions.

## Direct SQL bypass

Only employee write paths through `employeeService` are protected. Administrative SQL / legacy MERGE seed remain bypass vectors unless blocked by script guards.

## ENFORCE in production

**Not activated.** Default env and compose values remain `DISABLED`.