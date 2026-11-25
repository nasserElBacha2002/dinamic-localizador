# Commercial policy validation — DIN-463 final

## Mode matrix (unit)

| Check | Status | Evidence |
|-------|--------|----------|
| Matriz global × empresa completa | **PASS** | `resolve-effective-commercial-seat-mode.test.ts` (2 tests) |
| ENFORCE efectivo solo si global y empresa lo permiten | **PASS** | matrix + `commercial-seat-quota-settings.service.ts` (static) |
| Default global `DISABLED` | **PASS** | `env.ts` default `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE` |

## Integration (dedicated DIN-463)

| Scenario | Status | Evidence |
|----------|--------|----------|
| DISABLED — alta sin restricción comercial | **PASS** | policy integration test #1 |
| ENFORCE — sin suscripción vigente (INCONSISTENCY / allow) | **PASS** | policy test #2 + ledger `NO_VIGENT_SUBSCRIPTION` |
| ENFORCE — capacidad finita, segunda alta rechazada | **PASS** | policy test #3 + `REJECTED` / `mutation_persisted=false` |
| Idempotente reactivate ENFORCE `seat_max=1` | **PASS** | policy test #4 |
| Idempotente reactivate OBSERVE `seat_max=1` | **PASS** | policy test #5 |

## NOT_EXECUTED (política contractual)

| Scenario | Status |
|----------|--------|
| Alta con capacidad disponible (explicit) | PASS implied by #3 setup; no isolated case |
| Alta por encima del límite en OBSERVE (WOULD_EXCEED / allow) | NOT_EXECUTED |
| Empresa ya sobre cupo legacy (solo bloquear nuevos) | NOT_EXECUTED |
| Exención estratégica / persistida | NOT_EXECUTED |
| Contrato ilimitado (`seat_max` NULL) | NOT_EXECUTED |
| Sin término vigente | NOT_EXECUTED |
| Cambio de capacidad contractual | NOT_EXECUTED |
| Capacidad reducida bajo headcount actual | NOT_EXECUTED |
| Reactivación con/sin cupo | NOT_EXECUTED |
| Desactivación libera cupo y reutilización | NOT_EXECUTED |

## HTTP configuration

| Scenario | Status |
|----------|--------|
| Platform admin GET/PATCH commercial-seat-quota-settings | NOT_EXECUTED |
| Bloqueo ENFORCE empresa si global ≠ ENFORCE | NOT_EXECUTED (código: `COMMERCIAL_SEAT_ENFORCE_REQUIRES_GLOBAL_ENFORCE`) |