# Import path validation (DIN-463 corrections)

## Paths

| Path | Operation constant | Quota |
|------|-------------------|-------|
| Chunk batch | `EMPLOYEE_IMPORT_BATCH` | `createManyForImport` |
| Fallback row | `EMPLOYEE_IMPORT_ROW` | `employeeService.create` with `creationMode: "import"` |

Atomic chunk and row-by-row fallback preserved in `employees.strategy.ts`; no direct repository bypass.

## Automated verification

| Command | Result |
|---------|--------|
| `npm run build` | pass |
| Partial import / fallback integration | **not executed** |