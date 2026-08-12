# Implementation corrections validation (Fases 1–2 review fix)

## Causa raíz

El scanner de Fase 2 (`sql_boundaries.py`) trataba **toda** interpolación no-quoted como `sql-dynamic-structure` + `accepted-risk`, incluyendo:

- unknowns (`${someDynamicThing}`, `${whereClause}`)
- runtime unquoted (`${input.limit}`)
- `escapeSqlString(...)` fuera del generador offline

Política incorrecta: `unknown → accepted-risk`.

## Cambios realizados

### Scanner (`scripts/audit/framework/scanners/sql_boundaries.py`)

| Caso | Antes | Después |
|------|-------|---------|
| Quoted `${input.x}` | HIGH (ok) | HIGH `sql-injection-risk` |
| Unquoted `${input.limit}` / `req.query.sort` | accepted-risk | HIGH `requires-review` |
| `${USER_STATUS}` uppercase | podía ser “static” | HIGH quoted risk (nombre ≠ origen) |
| `escapeSqlString` global | safe | risk salvo archivo offline `service-fix/sql.ts` |
| `${statusParams.join(", ")}` | structural | known-safe INFO |
| `FAILURE_STATUSES_SQL` etc. | por UPPERCASE genérico | allowlist explícita + const literal local |
| `${unknown}` | accepted-risk | MEDIUM `sql-dynamic-unknown` `requires-review` |

### Conservado (sin revertir)

- Parametrizaciones Fase 2 (`@expectedStatus`, `@incrementAttempt`, `@statusN`, `@referenceAt`, `@minSample`, `@tableName`)
- `resolveSqlSort` / work-team whitelist
- Fase 1 lint/ciclos/phone/env

### Tests

- Framework: casos negativos/positivos obligatorios en `test_framework_core.py`
- Integration SQL Server:
  - `absence-attachment.sql-security.integration.test.ts`
  - `statistics.sql-security.integration.test.ts`
- Source regression: `sql-security-regression.test.ts` (defense-in-depth)

### Hygiene

- `.gitignore`: diffs phase1/phase2/implementation-corrections + `*.zip` / `Archivo.zip`

### Docs

- Este archivo + actualización de `phase2-sql-security-triage-validation.md` (manual triage vs scanner)

## Resultados de validación

| Command | Result |
|---------|--------|
| `npm run lint --prefix backend` | PASS (0 errors) |
| `npm run build:backend` | PASS |
| `npm test --prefix backend` | PASS (1267 unit) |
| `python3 -m unittest discover -s scripts/audit/framework/tests -p 'test_*.py'` | PASS (34) |
| Targeted SQL integration (`absence-attachment` + `statistics` sql-security) | PASS (7/7) |
| Full `test:integration` suite | 9 pre-existing failures unrelated (multi-company/settings/tenant); our suites ok |
| `npm run audit:database` | PASS; blocking=0; unknowns requires-review; no HIGH mass FP |
| `npm run audit:security:fast` | PASS |
| `npm run audit` (20260812-155323) | PASS diagnostic |
| `npm run audit:strict` (20260812-155651) | Quality gate PASSED |

## False positives eliminados (ejemplos)

- Ternarios literales `input.x ? "" : "AND ... @param"` ya no son unquoted-runtime
- `FAILURE_STATUSES_SQL` / `ACTIVE_STATUSES_SQL` / `@statusN` joins → known-safe
- Offline `service-fix/sql.ts` con `escapeSqlString` → known-safe (script only)

## False negatives ahora detectados (ejemplos)

- `WHERE name = '${input.name}'` → injection
- `SELECT TOP ${input.limit}` → unquoted runtime
- `ORDER BY ${req.query.sort}` → unquoted runtime
- `WHERE status = '${USER_STATUS}'` (uppercase) → injection
- `escapeSqlString(input.name)` en repository → escape-runtime review
- `${someDynamicThing}` → `sql-dynamic-unknown` requires-review (**nunca** accepted-risk)

## Limitaciones restantes

- No hay AST TypeScript: `${whereClause}` sigue siendo **unknown/requires-review** aunque el builder interno use `@params` (correcto: no se acepta sin prueba automática fuerte).
- ~27 findings `sql-dynamic-unknown` esperados post-recalibración (revisión manual / fases posteriores de SQL boundaries).
- Layer-boundary (185 SQL fuera de repos) fuera de alcance.

## Manual triage vs scanner (Fase 2)

| Concepto | Manual triage Fase 2 | Scanner corregido |
|----------|----------------------|-------------------|
| Confirmed vulnerable | 0 | 0 HIGH confirmed |
| Parameterized hotspots | fixed | source + integration evidence |
| Known-safe structural | documentado | INFO accepted-risk solo si **solo** known-safe |
| Unknown dynamic | no debía ser accepted | MEDIUM requires-review |
| False positive HIGH (40) | recalibrado | no vuelven como HIGH masivos |
