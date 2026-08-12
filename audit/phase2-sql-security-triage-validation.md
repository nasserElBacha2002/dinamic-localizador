# Phase 2 — SQL security triage validation

## Resumen

```text
Initial SQL injection suspects: 40 (one heuristic finding per file with SQL+${})
Confirmed vulnerable (exploitable user→SQL): 0 remaining after fixes
Needs parameterization (fixed this phase): 5 hotspot fixes
Whitelisted identifiers (verified): 6 patterns (ORDER BY / enums / table const)
Static fragments / safe builders: majority of remaining interpolations
False positives / recalibrated: 40 former HIGH → 40 info sql-dynamic-structure
Manual review remaining (high-confidence injection): 0
```

Scanner after recalibration (`audit:database` run `20260812-151612`):

```text
sql-injection-risk (HIGH): 0
sql-dynamic-structure (INFO, accepted-risk): 40
```

## Antes / Después

| Métrica | Antes | Después |
|---------|-------|---------|
| Findings `sql-injection-risk` HIGH | 40 | **0** |
| Findings estructurales SQL | (mezclados en HIGH) | 40 INFO `sql-dynamic-structure` |
| Interpolación quoted runtime en prod | sí (varios) | **0** detectados |
| CONFIRMED_VULNERABLE pendientes | — | **0** |

## Clasificación de los 40 findings iniciales

Cada finding original era **1 por archivo** (heurística gruesa). Tras inspección de ~261 interpolaciones:

| Finding ID | File | Classification | Action |
|------------|------|----------------|--------|
| sql-dyn-b5b3867b15 | database/operational-location-duplicate-remediation.ts | D STATIC / structural companyFilter | Keep; scanner→structure |
| sql-dyn-281a662147 | repositories/absence-attachment.repository.ts | B→fixed + D ACTIVE_STATUSES_SQL | Parametrize markStatus/listForCleanup |
| sql-dyn-93b6cf4702 | repositories/absence-calendar.repository.ts | D/E structural | Keep |
| sql-dyn-3dcbdd3962 | repositories/absence-request.repository.ts | C/D `toAbsenceStatusSqlInList` whitelist + structural where | Keep (whitelist already throws) |
| sql-dyn-b412921116 | repositories/absence-type.repository.ts | E SET fields hardcoded + params | Keep |
| sql-dyn-36f432341f | repositories/attendance-notification.repository.ts | D/E eligibility SQL builders | Keep |
| sql-dyn-6db2b0df8c | repositories/attendance.repository.ts | D/E whereClause + simulationFilter const | Keep |
| sql-dyn-d803178097 | repositories/bot-session.repository.ts | D ACTIVE states + structural | Keep |
| sql-dyn-95144923a9 | repositories/company-location-types.repository.ts | E SET `fields.push("col = @p")` | Keep |
| sql-dyn-ad00869bd0 | repositories/company-module.repository.ts | E VALUES `(@companyId, @moduleKeyN)` | Keep |
| sql-dyn-ecef735b68 | repositories/company-settings.repository.ts | D/E structural | Keep |
| sql-dyn-0acdbdba36 | repositories/employee-assignment-query.repository.ts | D/E structural | Keep |
| sql-dyn-589c8ef873 | repositories/employee-category.repository.ts | E SET fields + params | Keep |
| sql-dyn-8ffe25d7bc | repositories/employee-deactivation.repository.ts | E IN `@idN` placeholders | Keep |
| sql-dyn-acd0e7e5cd | repositories/employee-workday-availability.repository.ts | D filter fragments | Keep |
| sql-dyn-f12b14762c | repositories/employee-workday.repository.ts | E VALUES (@p,@p) sourceRows | Keep |
| sql-dyn-cefb094142 | repositories/employee.repository.ts | C `resolveSqlSort` whitelist + E filters | Keep |
| sql-dyn-41186dec85 | repositories/lookup.repository.ts | E UUID IN placeholders | Keep |
| sql-dyn-be846f8bed | repositories/operation-attendance.repository.ts | D/E base query fragments | Keep |
| sql-dyn-f16791ecc8 | repositories/operation-employee.repository.ts | E optional AND + IN placeholders | Keep |
| sql-dyn-8d9149f5af | repositories/operation-schedule.repository.ts | D/E structural | Keep |
| sql-dyn-184f87353d | repositories/operation-workday.repository.ts | D/E whereClause | Keep |
| sql-dyn-58b846a414 | repositories/operation.repository.ts | C ORDER BY whitelist | Keep |
| sql-dyn-5a58f14f60 | repositories/payroll-receipt.repository.ts | D FAILURE_STATUSES_SQL const | Strengthened to module const |
| sql-dyn-024b031a9d | repositories/service.repository.ts | C ORDER BY whitelist | Keep |
| sql-dyn-848b5c05d2 | repositories/statistics.repository.ts | B→fixed `@referenceAt`/`@minSample` + C sort | Fixed |
| sql-dyn-609cdb0d01 | repositories/user-company-membership.repository.ts | E SET fields | Keep |
| sql-dyn-3bf6f65fe5 | repositories/whatsapp-conversation.repository.ts | D companyClause | Keep |
| sql-dyn-386f094167 | repositories/whatsapp-observability.repository.ts | D/E whereSql | Keep |
| sql-dyn-1b25ce9420 | repositories/work-team-assignment-batch.repository.ts | E IN placeholders | Keep |
| sql-dyn-2b3e8aa702 | repositories/work-team.repository.ts | C→strengthened `resolveSqlSort` map | Fixed whitelist style |
| sql-dyn-b677998001 | scripts/audit-statistics-grain-core.ts | D script companyFilter | Keep (script) |
| sql-dyn-30a7ed2a4e | scripts/cleanup-integration-junk.ts | D junk predicate const | Keep (script) |
| sql-dyn-f116617359 | scripts/fix-services-from-reconciliation.ts | F non-SQL / summary text in template | F / structure |
| sql-dyn-504c39e680 | services/company-lifecycle.service.ts | D/E structural | Keep (out of repo layer; no value interp) |
| sql-dyn-e2a206e825 | utils/employee-workday-statistics-projection.ts | D EFFECTIVE_STATE uses `@referenceAt` | Keep |
| sql-dyn-9923cbcc68 | utils/service-fix/db-services.ts | B→fixed `@tableName`; columns via pickColumn whitelist | Fixed |
| sql-dyn-c760e54b9a | utils/service-fix/plan.ts | F distance in comments/messages not executed SQL | F |
| sql-dyn-a16a2d7904 | utils/service-fix/sql.ts | E script generator + escape; apply path parameterized | Documented; not runtime apply |
| sql-dyn-c598187821 | utils/statistics-canonical-attendance.ts | D static SQL const | Keep |

### Conteos de clasificación (fase)

| Category | Count (approx) |
|----------|----------------|
| A CONFIRMED_VULNERABLE | 0 (ningún flujo HTTP/Twilio→quoted SQL) |
| B VALUE_NEEDS_PARAMETERIZATION | 5 fixed (ver abajo) |
| C WHITELISTED_IDENTIFIER | verified/strengthened |
| D STATIC_SQL_FRAGMENT | majority |
| E SAFE_QUERY_BUILDER | SqlFilter / `@param` joins / SET fields |
| F FALSE_POSITIVE | plan.ts distance / non-exec templates |
| G REQUIRES_MANUAL_REVIEW | 0 high-confidence leftovers |

## Vulnerabilidades / parametrizaciones corregidas

### 1. `absence-attachment.repository.ts` — `markStatus`

- **Antes:** `AND status = N'${current.status}'` y `attempt_count + ${0|1}`
- **Origen:** fila DB previa (no HTTP directo), pero valor interpolado en SQL
- **Clasificación:** B
- **Fix:** `@expectedStatus`, `@incrementAttempt`
- **Test:** `sql-security-regression.test.ts`

### 2. `absence-attachment.repository.ts` — `listForCleanup`

- **Antes:** `IN (${statuses.map(s => N'${s}')})`
- **Origen:** argumento tipado; sin whitelist runtime
- **Clasificación:** B
- **Fix:** whitelist `ABSENCE_ATTACHMENT_STATUSES` + `@statusN`
- **Test:** regression source asserts

### 3. `statistics.repository.ts` — ranking HAVING

- **Antes:** `<= '${referenceAt.toISOString()}'` y `>= ${minSample}`
- **Origen:** `Date` / constante numérica, interpolados como literales
- **Clasificación:** B
- **Fix:** `@referenceAt` (ya bound) + `@minSample` bound en requests
- **Test:** regression source asserts

### 4. `service-fix/db-services.ts`

- **Antes:** `WHERE TABLE_NAME = '${TABLE_NAME}'`
- **Clasificación:** B (const) / C table name
- **Fix:** `@tableName`; `FROM` usa literal `TABLE_NAME` const

### 5. `work-team.repository.ts` — ORDER BY

- **Antes:** ternario ad-hoc sort column/direction
- **Clasificación:** C (ya seguro) → fortalecido
- **Fix:** `WORK_TEAM_LIST_SORT_COLUMNS` + `resolveSqlSort`

### 6. `payroll-receipt.repository.ts`

- **FAILURE_STATUSES.map** inline → `FAILURE_STATUSES_SQL` module const (D)

## Casos seguros (evidencia)

### Whitelists ORDER BY

- `resolveSqlSort` + maps en employee/service/operation/statistics/work-team
- Unknown keys → default column; direction solo `ASC`/`DESC`

### Enum SQL fragments

- `toAbsenceStatusSqlInList` throws on unknown status (tested)
- `ACTIVE_STATUSES_SQL`, `ACTIVE_BOT_SESSION_STATES_SQL`, `FAILURE_STATUSES_SQL`

### Query builders

- `SqlFilter` + `applySqlFilters` / `createUuidInFilter` bind `@params`
- Dynamic `SET`/`VALUES` use hardcoded column names + `@param`

### service-fix apply path

- `apply.ts` already parameterized; `sql.ts` only builds review scripts with `escapeSqlString`

## Scanner improvements

File: `scripts/audit/framework/scanners/sql_boundaries.py`

1. Deja de marcar **todo** `${}` en SQL como `sql-injection-risk` HIGH.
2. Detecta **quoted value interpolation** / `LIKE '%${` → HIGH `sql-injection-risk`.
3. Clasifica el resto como INFO `sql-dynamic-structure` (`accepted-risk`).
4. Excepciones explícitas para `escapeSqlString(...)` (script generation) y constantes `UPPER_SNAKE`.
5. Unit tests en `test_framework_core.py::TestSqlInterpolationClassification`.

**No** se agregó ignore-list de archivos repository.

## Tests ejecutados

| Command | Result |
|---------|--------|
| `npx tsx --test src/utils/sql-security-regression.test.ts` | PASS |
| `npm test --prefix backend` | PASS (1295) |
| `npm run build:backend` | PASS |
| `python3 -m unittest …TestSqlInterpolationClassification` | PASS |
| `python3 -m unittest discover -s scripts/audit/framework/tests` | PASS (27) |
| `npm run audit:database` | PASS; inj=0 struct=40 |
| `npm run audit:security:fast` | PASS (secrets/env) |
| `npm run audit` | PASS diagnostic (re-run after status fix) |

DB integration suite: no ejecutada aquí (requiere SQL Server + `RUN_DB_INTEGRATION_TESTS`); cambios son bind parameters equivalentes.

## Limitaciones del scanner (restantes)

- No es un parser TypeScript/SQL completo: un `whereClause` mal construido con valores concatenados en otro helper **no** se detecta como quoted-risk si el template solo interpola `${whereClause}`.
- Mitigación: revisión de builders (`SqlFilter`) + tests de regresión en hotspots.
- Scripts/tests con UUID literales en templates siguen fuera del walk (`exclude_globs` `*.test.ts`).

## Fuera de alcance (registrado)

- 185 SQL layer-boundary findings
- Race/idempotency / Twilio architecture
- npm dependency upgrades
- Baseline oficial

## Conclusión

> Todas las interpolaciones SQL de los 40 findings iniciales fueron investigadas. Los valores runtime detectados en quotes se parametrizaron. Los identifiers dinámicos restantes usan whitelists cerradas. No quedan SQL injections confirmadas sin corregir. El scanner distingue riesgo de inyección vs estructura dinámica sin ocultar archivos enteros.
