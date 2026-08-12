# Phase 1 — Quality gate cleanup validation

## Antes (reconstruido al inicio de la fase)

```text
backend ESLint: 58 errors
backend cycles: 2
  - utils/absence-duration.ts ↔ utils/absence-year-allocations.ts
  - types/statistics.ts ↔ utils/statistics-action-exceptions.ts
frontend cycles: 1
  - WorkTeamForm.tsx ↔ utils/work-team-save.ts
phone empty catch: 1 (backend/src/utils/phone.ts maskPhoneNumberForLog)
env documentation: fail (21 used_but_not_documented)
```

## Después (comprobado)

```text
backend ESLint: 0 errors
backend cycles: 0 (madge ✔ No circular dependency found!)
frontend cycles: 0 (madge ✔ No circular dependency found!)
phone empty catch: 0 (usa tryNormalizeWhatsAppPhone ?? trimmed)
env documentation: pass (missing_docs=0; documented=111)
npm run audit: overall_status=ok, blocking_count=0, findings≈230 (no es objetivo de Fase 1)
```

## Comandos ejecutados

| Comando | Resultado |
|---------|-----------|
| `npm run lint --prefix backend` | PASS (0 errors) |
| `npm run build:backend` / `tsc -p tsconfig.json` | PASS (typecheck vía build) |
| `npm run test --prefix backend` | PASS (1271 tests) |
| `npm run lint --prefix frontend` | PASS (0 errors, 8 warnings preexistentes) |
| `npm run build:frontend` (`tsc -b && vite build`) | PASS |
| `npm run test --prefix frontend` | PASS (678 tests) |
| `npx madge --circular` backend + frontend | PASS (0 cycles) |
| `bash scripts/audit/run_backend_architecture_audit.sh` | PASS |
| `bash scripts/audit/run_frontend_architecture_audit.sh` | PASS |
| `python3 scripts/audit/audit_env_documentation.py` | PASS (missing_docs=0) |
| `npm run audit` (run `20260812-145928`) | PASS diagnostic; security-env pass; backend-eslint pass; circular-imports pass |

## ESLint — clasificación aproximada (58 → 0)

| Categoría | Aprox. |
|-----------|--------|
| unused imports / vars (prod + test) | ~35 |
| prefer-const / useless-assignment | ~8 |
| regex / escaping / control-regex | ~6 |
| incomplete refactor leftovers (`previewRows`, dead helpers, unused imports) | ~6 |
| empty catch (`phone.ts`) | 1 |
| other (type-param unused in AssertAssignable) | ~2 |

### Incomplete-refactor checks (no se borró lógica viva)

| Símbolo | Decisión |
|---------|----------|
| `assertValidAssignmentDateRange` | A) sigue en `operation-assignment-core.service.ts` → se eliminó solo el import muerto en `operation-assignment.service.ts` |
| `workdayMaterializationService` | A) el flujo usa `recurringWorkdayMaterializationService` → import muerto eliminado |
| `OperationImportFormat` | import tipo sin uso → eliminado |
| `previewRows` | mapa muerto; el return ya usaba `rows` → eliminado |
| `StatisticsTimeContext` | import sin uso en repository → eliminado |
| `compatibleOperation` / `checkoutEligibleOperation` | helpers de test sin consumidores → eliminados |

## Circular dependencies

### Backend absence

- **Causa:** `AbsenceDayBreakdown` (o tipo compartido) cruzaba `absence-duration` ↔ `absence-year-allocations`.
- **Solución:** `absence-day-breakdown.types.ts` neutral.
- **Dirección final:** ambos utils → types compartidos (sin ciclo).

### Backend statistics

- **Causa:** `types/statistics.ts` importaba utilidades de action-exceptions.
- **Solución:** tipos/contratos de excepciones y `PeriodMetricDelta` viven en `types/statistics.ts`; utils importan types.
- **Dirección final:** types ← utils.

### Frontend WorkTeamForm

- **Causa:** `work-team-save.ts` importaba tipos desde el componente React.
- **Solución:** `work-team-form.types.ts`.
- **Dirección final:** Form + save → types.

## phone.ts

- **Contrato:** parser fallible + máscara para logs sin PII completa.
- **Antes:** `catch {}` vacío tras normalizar.
- **Después:** `tryNormalizeWhatsAppPhone(...) ?? trimmed` (fallo de parse = mascara el valor crudo).
- **Tests:** `backend/src/utils/phone.test.ts` (valid / invalid / short / unexpected-invalid mask).

## ENV documentadas

Claves pasadas de comentario `# KEY=` a `KEY=` (placeholders vacíos) en `.env.example` y/o `backend/.env.example`:

| Variable | Clasificación |
|----------|---------------|
| `BOT_DEFAULT_COMPANY_ID` / `BOT_DEFAULT_COMPANY_NAME` | optional runtime |
| `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` | migration-only optional |
| `DB_PRIVILEGE_TEST_USER` / `DB_PRIVILEGE_TEST_PASSWORD` | test-only |
| `SMTP_*` (+ timeouts) | optional production (smtp transport) |
| `RUN_DB_INTEGRATION_TESTS` / `RUN_DB_PRIVILEGE_TESTS` | test-only |
| `FRONTEND_IMAGE` | docker/compose + CI deploy |
| `GCLOUD_PROJECT` | optional script/ADC hint |
| `OWNER_PASSWORD` | script-only (seed-integration-ci) |
| `TEST_COMPANY_ID` / `TEST_ABSENCE_REQUEST_ID` | test-only fixtures |

Excepciones del auditor sin documentar (preexistentes): `ADMIN_*`, `MSSQL_SA_PASSWORD`, alias `GOOGLE_MAPS_API_KEY`.

## Bugs reales encontrados

Ninguno funcional de negocio. Solo deuda de lint/ciclos/docs y un catch vacío que no alteraba el contrato de máscara (ya degradaba al input crudo).

## Findings fuera de alcance (siguen pendientes — fases posteriores)

- SQL injection suspects / SQL outside repositories
- God classes / SOLID-GRASP
- npm moderate vulns (`@google-cloud/storage` tree)
- Frontend ESLint warnings (hooks) preexistentes
- Baseline oficial no creada

## Quality gates Fase 1

| Gate | Status |
|------|--------|
| backend lint | PASS |
| backend build / typecheck | PASS |
| backend tests | PASS |
| frontend lint | PASS (warnings only) |
| frontend build / typecheck | PASS |
| frontend tests | PASS |
| backend circular deps | PASS |
| frontend circular deps | PASS |
| environment documentation | PASS |
