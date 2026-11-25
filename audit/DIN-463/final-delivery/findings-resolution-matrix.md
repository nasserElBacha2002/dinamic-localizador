# DIN-463 — findings & scenario resolution (definitive validation)

**Closure recommendation:** `IMPLEMENTED_PENDING_VALIDATION`  
**Rationale:** Regresión SQL completa en verde y validación estática/unitaria de modos y XACT_STATE; la matriz de aceptación comercial §3–§7 sigue con escenarios **NOT_EXECUTED** que el propio ticket marca como esenciales para `IMPLEMENTED_VALIDATED`.

## Toolchain

| Item | Class | Notes |
|------|-------|-------|
| SQL disposable env | **PASS** | `din_integration` @ `1433`, `@@SERVERNAME=c60449e5dbda` |
| Build | **PASS** | exit 0 |
| Typecheck (via build) | **PASS** | `tsc` |
| Unit backend | **PASS** | 2356/2356 |
| Mode matrix + XACT_STATE | **PASS** | 5 tests |
| ESLint repo | **FAIL** | exit 1, 41 pre-existing |
| Integration full | **PASS** | 884/884, exit 0 |
| prepErrorCode wiring | **PASS** | static + uncommitted diff |

## Adversarial code review items

| Item | Class |
|------|-------|
| P0/P1 open defects | **PASS** (review: aprobado con observaciones) |
| XACT_STATE = 1 after tolerable SQL errors | **PASS** (code + 3 unit tests) |
| prepErrorCode preservation | **PASS** (code) |

## Essential gaps blocking `IMPLEMENTED_VALIDATED`

| Area | Essential scenarios | Class |
|------|---------------------|-------|
| §3 Import mass | 6 cases | **NOT_EXECUTED** |
| §3 Reactivation beyond idempotent happy path | 5+ cases | **NOT_EXECUTED** |
| §4 Concurrency matrix | 11 of 12 | **NOT_EXECUTED** |
| §5 Controlled failures | all listed | **NOT_EXECUTED** |
| §6 Ledger matrix | most decisions/fields | **PARTIAL** (2 asserts) |
| §7 HTTP commercial settings | all | **NOT_EXECUTED** |
| §8 Migration 175 rollback/redo | dedicated | **NOT_EXECUTED** |

## Pass highlights (executable proof)

| Scenario | Class | Evidence |
|----------|-------|----------|
| ENFORCE last seat rejection + ledger | **PASS** | policy integration |
| Concurrent dual create last seat | **PASS** | concurrency integration |
| DISABLED / no sub / idempotent reactivate | **PASS** | policy integration |
| Full platform regression | **PASS** | integration 884 |
| Migration 175 forward on ephemeral | **PASS** | provision log |

## Preparation vs authorization

| Stage | Status |
|-------|--------|
| Implementación funcional | **Completada** (review adversarial OK) |
| Validación técnica §3–§7 completa | **Pendiente** (matriz parcial) |
| Despliegue con DISABLED | **Preparado** (default env + regresión) |
| Activar OBSERVE | **No autorizado** — falta cobertura |
| Activar ENFORCE | **No autorizado** — fuera de pruebas aisladas |