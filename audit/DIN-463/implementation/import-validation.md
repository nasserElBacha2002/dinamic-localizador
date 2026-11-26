# Import validation

- Batch path: `createManyForImport` calls admission with `delta = inputs.length` before `createMany` (atomic chunk).
- Fallback path: per-row `employeeService.create` reuses same admission (`employees.strategy.ts` unchanged).
- Failed rows do not consume quota (transaction rollback per chunk or per row).
- Partial success semantics preserved.