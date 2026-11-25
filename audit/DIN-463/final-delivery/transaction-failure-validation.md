# Transaction / technical failure validation — DIN-463 final

## Unit (executed)

| Check | Status | Evidence |
|-------|--------|----------|
| `XACT_STATE` = 1 permite mutación | **PASS** | `sql-transaction-state.test.ts` |
| `XACT_STATE` = 0 → `SQL_TRANSACTION_UNUSABLE` | **PASS** | idem |
| `XACT_STATE` = -1 → `SQL_TRANSACTION_UNUSABLE` | **PASS** | idem |

## Code path (static, adversarial review approved)

| Check | Status | Evidence |
|-------|--------|----------|
| `prepErrorCode` propagado `prepare` → `lockPrepared` → `reason_code` | **PASS** | `commercial-seat-quota.service.ts`, `employee.service.ts` (diff in `final-diff.txt`) |
| No reemplazo genérico por `APP_LOCK_NOT_ACQUIRED` si hay `prepErrorCode` | **PASS** | `lockPrepared.prepErrorCode ?? "APP_LOCK_NOT_ACQUIRED"` |

## NOT_EXECUTED (inyección controlada en SQL)

| Scenario | Status |
|----------|--------|
| Fallo recuperable en lectura de configuración (prep) | NOT_EXECUTED |
| Timeout / fallo lock comercial | NOT_EXECUTED |
| Fallo en conteo de activos | NOT_EXECUTED |
| Fallo resolución contractual / exenciones | NOT_EXECUTED |
| Fallo persistencia colaborador | NOT_EXECUTED |
| Fallo persistencia ledger autónomo | NOT_EXECUTED |
| OBSERVE no bloquea ante error comercial recuperable | NOT_EXECUTED (solo idempotente OBSERVE sin inyección) |
| ENFORCE bloquea sin evaluación fiable | NOT_EXECUTED |
| Reactivación idempotente con prep recuperable | NOT_EXECUTED |
| Reactivación idempotente con lock timeout recuperable | NOT_EXECUTED |
| Reactivación real con mismo fallo en ENFORCE | NOT_EXECUTED |
| Escrituras tras transacción inválida | NOT_EXECUTED |

## Partial regression

Integration tests with injected failures exist for **other** domains (migrations, absence, operations) and passed in the 884 suite; they do not assert DIN-463 commercial admission failure semantics.