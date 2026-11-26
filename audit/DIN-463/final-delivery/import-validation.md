# Import validation — DIN-463 final

**Note:** `employeeService.createManyForImport` enforces commercial admission in code; dedicated DIN-463 import scenarios were **not** executed in this closure pass.

| Scenario | Status |
|----------|--------|
| Importación dentro del límite | NOT_EXECUTED |
| Importación que supera capacidad | NOT_EXECUTED |
| Atomicidad por lote | NOT_EXECUTED |
| Fallback fila por fila | NOT_EXECUTED |
| Import parcial ENFORCE sin exceder cupo | NOT_EXECUTED |
| Reintentos sin duplicación de cupo | NOT_EXECUTED |

## Regression

Employee/generic import integration tests ran in full suite (`generic-import.integration.test.ts`, `import-clients.integration.test.ts`, etc.) — **PASS** in global 884 run under default global **DISABLED** (commercial admission effectively off unless tests override env).