# DIN-462 — Auditoría técnica de aislamiento de bases de datos para tests

**Fecha:** 2026-11-22  
**Alcance:** Solo lectura — sin ejecución de tests con escritura, sin migraciones, sin cambios en CI/env.  
**Estado final:** `AUDITED_READY_FOR_IMPLEMENTATION`

---

## 1. Resumen ejecutivo

| Área | Hallazgo |
|------|----------|
| CI `npm test` (unit) | **No conecta a SQL** en el job `backend-quality`; suites DB están gated o skipped. |
| CI integración | **SQL Server efímero por job** (contenedor GitHub Actions), una BD compartida `dinamic_attendance` por ejecución del job. |
| Patrón efímero | **Existe solo para billing DIN-406** (`din406_bce_*`) con guards fail-closed relativamente fuertes. |
| Riesgo local | **Probable y alto** si un desarrollador corre `test:integration` o `RUN_DB_INTEGRATION_TESTS=true` con `backend/.env` apuntando a SQL persistente (dev/staging) y `DB_NAME=dinamic_attendance`. |
| Aislamiento por ejecución | **No implementado** para el grueso de ~151 suites de integración; comparten BD y fixtures semilla. |
| Frontend/website | **Sin SQL**; mocks de módulos y API. |
| E2E | **No hay** runners E2E en el repo. |

---

## 2. Arquitectura actual comprobada

### 2.1 Monorepo y scripts de test

| Paquete | Comando | Runner | SQL |
|---------|---------|--------|-----|
| Raíz | `npm test` → backend + frontend + website | npm workspaces | Solo backend *podría* si flags locales |
| Backend unit | `node ./scripts/run-unit-tests.mjs` | `tsx --test`, concurrency 1 | Gated (`describeDatabaseIntegration` → `describe.skip`) |
| Backend integration | `node ./scripts/run-integration-tests.mjs` | Idem + fuerza `RUN_DB_INTEGRATION_TESTS=true` | Sí |
| Frontend | `tsx --test` + mocks Vite | happy-dom / mocks | No |
| Website | Igual que frontend | Idem | No |

Evidencia:

- `package.json` (raíz L19): encadena tests sin flags DB.
- `backend/package.json` (L45–46): `test` vs `test:integration`.
- `backend/scripts/run-unit-tests.mjs` (L24, L49–54): excluye `*.integration.test.ts`, preload `preload-test-env.ts`.
- `backend/scripts/run-integration-tests.mjs` (L23–24, L59–62): solo `*.integration.test.ts`, setea `RUN_DB_INTEGRATION_TESTS=true`.

### 2.2 Preload de entorno

```8:26:backend/src/test-helpers/preload-test-env.ts
// Load local .env first so integration runs keep real DB credentials.
...
if (process.env.RUN_DB_INTEGRATION_TESTS === "true") {
  // Keep DB_*/JWT from .env or CI; force test-safe gates ...
} else {
  setupUnitTestEnv();
}
```

**Implicación adversarial:** en integración local, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` provienen de `backend/.env` real; no se sustituyen por placeholders de `unit-test-env.ts`.

Defaults unitarios (sin integración):

```5:9:backend/src/test-helpers/unit-test-env.ts
  DB_HOST: "localhost",
  DB_PORT: "1433",
  DB_NAME: "dinamic_attendance",
```

### 2.3 Conexión SQL de aplicación

Un único pool global vía `env` (`backend/src/database/connection.ts` L4–18, L39–47). No hay inyección automática de URL de test en runtime de app; tests usan `setTestPool` solo en casos puntuales.

Migraciones en CI usan las mismas credenciales (`npm run migrate` en quality-gate).

### 2.4 Inventario cuantitativo (conteo en disco)

| Categoría | Cantidad |
|-----------|----------|
| `*.integration.test.ts` | 151 |
| `*.test.ts` excl. integración | 424 |
| Frontend `*.test.ts(x)` | 210 |
| Website tests | 8 |
| Suites efímeras billing (`*.ephemeral.integration.test.ts`) | 6 + helper suite |

---

## 3. Inventario de tests y conexiones

### 3.1 Backend — sin SQL (unit puro o mocks)

- Mayoría de los 424 archivos `*.test.ts` (excl. integración): lógica, mocks de repos (`node:test` `mock`), HTTP con `startTestServer` sin `setupDatabaseIntegration`.
- Ejemplo mock-heavy sin DB: `backend/src/services/whatsapp/whatsapp-webhook.integration.test.ts` — nombre engañoso; **corre en unit** (no matchea `*.integration.test.ts`) pero usa `mock` y `setupUnitTestEnv` (L3–13).

### 3.2 Backend — SQL gated (integración)

Patrón estándar:

```78:86:backend/src/test-helpers/integration-test.ts
export const isDatabaseIntegrationEnabled = (): boolean =>
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  REQUIRED_INTEGRATION_ENV.every((key) => Boolean(process.env[key]));

export const describeDatabaseIntegration = isDatabaseIntegrationEnabled()
  ? describe
  : describe.skip;
```

~151 archivos `*.integration.test.ts` llaman `setupDatabaseIntegration()` → `connectDatabase()`.

### 3.3 Backend — SQL embebido en archivos *no* `*.integration.test.ts`

Cuatro archivos unitarios incluyen bloques `describeDatabaseIntegration` (skipped salvo flag):

| Archivo | Líneas relevantes |
|---------|-------------------|
| `backend/src/services/absence/absence-balance.service.test.ts` | L25–27 |
| `backend/src/database/bot-session-absence-kind-migration.test.ts` | L77–79 |
| `backend/src/services/absence/absence-request.stabilization.test.ts` | L19–21 |
| `backend/src/controllers/company-membership.contract.test.ts` | L34+ |

**Riesgo menor:** si el flag está activo, `npm test` (unit runner) **también ejecuta** esos bloques DB porque no están excluidos por nombre.

### 3.4 Backend — SQL efímero (CREATE/DROP DATABASE)

Implementación: `backend/src/test-helpers/ephemeral-billing-exemption-database.ts`

- Prefijo: `din406_bce_` + timestamp (L16, L296).
- Requiere: `RUN_DB_INTEGRATION_TESTS`, `INTEGRATION_SQL_DDL_ALLOWED`, `INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED` (L69–74).
- Valida `@@SERVERNAME` / `DB_HOST` / `INTEGRATION_SQL_EXPECTED_SERVER_NAME` (L77–131).
- Bootstrap parcial de esquema billing + migraciones 159–169 (L223–240).
- Limpieza compensatoria en error (L256–287).

Suites consumidoras: 6 `*.ephemeral.integration.test.ts` bajo `backend/src/services/billing/`.

### 3.5 Frontend y website

- `frontend/src/test/setup-vite-env.mjs`: fija API mock; sin mssql.
- Tests que mencionan `database` son objetos JSON de status (p. ej. `frontend/src/pages/platform/ServerStatusPage.test.tsx`).

### 3.6 CI

**`backend-quality`** (`.github/workflows/quality-gate.yml` L43–44): solo `npm test` — sin servicio SQL.

**`backend-integration`** (L115–210):

- Service `mcr.microsoft.com/mssql/server:2022-latest`
- Env: `DB_NAME=dinamic_attendance`, `RUN_DB_INTEGRATION_TESTS=true`, `INTEGRATION_SQL_DDL_ALLOWED=true`
- Crea BD una vez, `npm run migrate`, `seed:integration-ci`, `npm run test:integration`
- **No setea** `INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED` → suites efímeras billing **skipped** en CI salvo cambio futuro.

### 3.7 Scripts auxiliares con escritura SQL

| Script | Riesgo | Guards |
|--------|--------|--------|
| `seed-integration-ci.ts` | INSERT/UPDATE fixtures | Usado solo en CI step explícito |
| `cleanup-integration-junk.ts` | DELETE masivo | Conecta vía `.env` del desarrollador; sin guards de integración |
| `seed-billing-*` | Seeds billing | `assertSafeIntegrationDatabaseTarget` + `BILLING_*_SEED_ALLOWED` |
| `ensure-billing-*-migration.ts` | DDL en BD compartida | `assertSafeIntegrationDatabaseTarget` + connected `DB_NAME()` |

---

## 4. Riesgos priorizados (con evidencia)

### P0 — Confirmado (diseño)

| ID | Riesgo | Evidencia |
|----|--------|-----------|
| P0-1 | Integración local usa credenciales reales de `.env` | `preload-test-env.ts` L8–17 |
| P0-2 | Guard DDL solo exige `DB_NAME === dinamic_attendance`, no identidad de servidor ni allowlist de host | `integration-test.ts` L37–41; tests en `integration-test.gating.test.ts` L54–57 permiten host remoto si `INTEGRATION_SQL_DDL_ALLOWED=true` |
| P0-3 | Una sola BD compartida por job CI y por ejecución local típica | `quality-gate.yml` L189–194; semilla compartida `Dinamic Systems` (`seed-integration-ci.ts` L8–18) |

### P1 — Probable

| ID | Riesgo | Evidencia |
|----|--------|-----------|
| P1-1 | Dev con Docker local `dinamic_attendance` + integración contamina datos de desarrollo habituales | Mismo nombre `INTEGRATION_DATABASE_NAME` (`integration-test.ts` L18) |
| P1-2 | `npm test` con `RUN_DB_INTEGRATION_TESTS=true` ejecuta bloques DB en 4 archivos unitarios | Lista en §3.3; `run-unit-tests.mjs` no filtra por contenido |
| P1-3 | Helpers `ensureBilling*Migration` aplican/reparan DDL en BD “compartida” | `ensure-billing-catalog-migration.ts` L78–89 |
| P1-4 | `phase3-4-db-security.integration.test.ts` crea usuarios/roles de prueba en BD compartida | L23–28, suites con `CREATE USER` |
| P1-5 | Rate limit integration escribe filas `itest:*` | `rate-limit-store.integration.test.ts` L24, L39 |

### P2 — Residual / operativo

| ID | Riesgo | Evidencia |
|----|--------|-----------|
| P2-1 | Basura histórica en BD dev; limpieza manual con heurísticas de nombre | `cleanup-integration-junk.ts` L31–46, emails `@integration.test`, `@test.local` en suites |
| P2-2 | Documentación `.env.example` sugiere `RUN_DB_INTEGRATION_TESTS=true npm test` pero integración es otro script | `.env.example` L288 vs `test:integration` |
| P2-3 | Suites efímeras billing no corren en CI actual | `quality-gate.yml` sin `INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED` |

### P3 — No verificable (sin ejecutar)

- Si algún entorno de staging/prod usa literalmente `DB_NAME=dinamic_attendance` y expone el mismo host a desarrolladores.
- Contenido real de `backend/.env` locales (ignorado por auditoría).

### Protecciones existentes

1. Opt-in `RUN_DB_INTEGRATION_TESTS` (default off en unit CI).
2. `describe.skip` cuando falta opt-in.
3. Doble flag para DDL (`INTEGRATION_SQL_DDL_ALLOWED`).
4. Triple flag + identidad servidor para CREATE DATABASE billing.
5. `assertSafeIntegrationDatabaseConnectedTarget` para DDL helpers.
6. Trackers `createIntegrationFixtureTracker` + script junk cleanup.
7. Workers/correo desactivados en CI integration env.

**Limitación principal:** la mayoría de guards son **nombre de BD + flags**, no **identidad verificada del servidor** ni **BD única por proceso**.

---

## 5. Datos de prueba históricos

### 5.1 Marcadores observables en código

- Emails: `*@integration.test`, `*@test.local` (grep masivo en `backend/src`).
- Empleados: nombres `Emp *`, `* Integration` (`cleanup-integration-junk.ts` L31–45).
- Compañías: `Integration Test Co ${Date.now()}-...` (`platform-company.integration.test.ts` L22).
- Rate keys: `itest:shared:`, `itest:concurrent:` (`rate-limit-store.integration.test.ts`).
- BD efímeras huérfanas: prefijo `din406_bce_` (`ephemeral-billing-exemption-database.ts` L16).

### 5.2 Auditoría de limpieza propuesta (fase separada)

1. **Inventario read-only** por dominio (companies, users, employees, operations, bot_sessions, rate_limit_buckets).
2. Consultas con reglas compuestas (email domain + created_at window + ausencia de uso productivo).
3. Export CSV de candidatos + checksum por tabla (hash de PKs ordenadas), no solo `COUNT(*)`.
4. Comparación antes/después solo en entorno aprobado con backup verificado.

**No ejecutar DELETE** sin aprobación explícita (restricción DIN-462).

---

## 6. Alternativas técnicas

| Opción | Descripción | Pros | Contras |
|--------|-------------|------|---------|
| **A — Generalizar patrón efímero** | Extender `ephemeral-billing-exemption-database.ts` a `createEphemeralTestDatabase()` para toda integración | Aislamiento fuerte, ya probado en billing | Tiempo migración alto; migraciones completas lentas; necesita login con `CREATE DATABASE` |
| **B — BD por ejecución en CI** | `dinamic_attendance_${GITHUB_RUN_ID}_${GITHUB_JOB}` o UUID; drop al final | Concurrencia entre jobs; sin tocar dev | Local aún manual; requiere hook en runners |
| **C — Contenedor SQL dedicado por developer** | Documentar compose profile `test-sql` + credenciales distintas | Bajo cambio código | No fail-closed si `.env` mal copiado |
| **D — Transacciones rollback** | Wrap cada test en transacción | Rápido | SQL Server + código con múltiples conexiones/jobs lo rompe; no cubre DDL |
| **E — Servidor in-memory / mock SQL** | No viable hoy | — | Semántica T-SQL incompatible |

### Recomendación

**Híbrido A + B + fail-closed global:**

1. **Gate universal pre-conexión** (nuevo módulo `test-database-guard.ts`): consultar `@@SERVERNAME`, `DB_NAME()`, opcional `SERVERPROPERTY('Edition')`, comparar con allowlist (`INTEGRATION_SQL_EXPECTED_SERVER_NAME` obligatorio fuera de loopback).
2. **BD única por ejecución** con prefijo `din_test_${uuid}`; migraciones completas vía `run-migrations.ts`; inyectar `DB_NAME` a proceso hijo y `setTestPool`.
3. **Mantener** semilla mínima determinista (idempotente) post-migrate.
4. **CI:** crear/drop BD en job; **local:** mismo flujo en `run-integration-tests.mjs`.
5. **Unit:** prohibir conexión real — assert en `connectDatabase` si `NODE_ENV=test` y flag de integración ausente (fail-closed).
6. **Renombrar/mover** los 4 archivos con bloques DB embebidos a `*.integration.test.ts`.

Reutilizar evidencia/cleanup de `destroyEphemeralBillingDatabaseOnly` (L149–161).

---

## 7. Plan mínimo de implementación

| Fase | Entregable | Depende de |
|------|------------|------------|
| 1 | `assertTestDatabaseTarget()` fail-closed en `connectDatabase` | Ninguno |
| 2 | Factory BD efímera + hook en `run-integration-tests.mjs` | Login `CREATE DATABASE` en CI/local |
| 3 | Variables `.env.example`: `TEST_DB_PREFIX`, `INTEGRATION_SQL_EXPECTED_SERVER_NAME` requerido si host ≠ localhost | Docs |
| 4 | Migrar suites billing efímeras al factory común | Fase 2 |
| 5 | Job CI: BD por `run_id`; teardown `always()` | Fase 2 |
| 6 | Snapshot checksum baseline para “BD habitual intacta” (script read-only) | Fase 2 |
| 7 | Auditoría limpieza histórica (solo reporte) | Aprobación negocio |

**Bloqueos:** permisos SQL `CREATE DATABASE` en entornos locales; tiempo de migrate completo (~169 migraciones); posible ajuste de semillas que asumen company fija `Dinamic Systems` (migración 015).

---

## 8. Matriz de validación (criterios de aceptación DIN-462)

| # | Criterio | Estado actual | Verificación futura |
|---|----------|---------------|---------------------|
| 1 | Dos ejecuciones concurrentes no comparten BD | **GAP** — una BD por job, serial `test-concurrency=1` | Dos procesos con UUID distinto + consulta `DB_NAME()` |
| 2 | Tests no escriben en DB habitual/staging/prod | **RIESGO** — depende de `.env` local | Guard server identity + credenciales test-only |
| 3 | Config insegura bloquea antes de escribir | **PARCIAL** — solo DDL/ephemeral | Fall en `connectDatabase` |
| 4 | Esquema temporal = migraciones | **OK en CI** migrate completo; efímero billing solo 159–169 | Assert `system_migrations` count ≥ producción test baseline |
| 5 | Fixtures deterministas | **PARCIAL** — muchos `Date.now()` en emails | Semillas fijas + trackers |
| 6 | Test fallido no impide limpieza | **OK** efímero billing compensa | `finally` drop DB en runner |
| 7 | Interrupción deja recursos recuperables | **PARCIAL** — `din406_bce_*` listables | Script orphan scan + drop |
| 8 | `npm test` y CI usan aislamiento | **GAP** — unit CI aislado; integration no por-run | Documentar + enforce scripts |
| 9 | BD habitual intacta (más que counts) | **NO IMPLEMENTADO** | Checksum PK por tabla antes/después |

---

## 9. Riesgos residuales post-implementación

- Costo tiempo CI (migrate × N si mal diseñado).
- Tests que requieren datos legacy en BD compartida de dev.
- `cleanup-integration-junk.ts` sigue siendo destructivo si se corre contra prod (sin guards).
- Privilege tests (`RUN_DB_PRIVILEGE_TESTS`) seguirán mutando roles si se habilitan contra BD equivocada.

---

## 10. Dependencias

- SQL Server 2022 (ya en CI).
- `mssql` pool único — requiere `setTestPool` o reconnect tras cambiar `DB_NAME`.
- Migraciones en `database/migrations/` (ruta relativa `../database/migrations` desde backend).
- Sin Redis obligatorio en tests (`RATE_LIMIT_BACKEND` default memory en unit defaults L39).

---

## 11. Estado final

**`AUDITED_READY_FOR_IMPLEMENTATION`**

La base arquitectónica (gating, CI disposable container, prototipo efímero billing, trackers de cleanup) es suficiente para implementar aislamiento por ejecución sin rediseñar el stack. El bloqueo no es técnico absoluto sino **consistencia y fail-closed global**; sin implementación, el riesgo local contra la BD de desarrollo permanece **material**.

---

## Apéndice — Referencias rápidas de líneas

| Tema | Archivo:Líneas |
|------|----------------|
| Nombre BD integración | `integration-test.ts:18` |
| Guards DDL | `integration-test.ts:24–43` |
| Connected target | `integration-test.ts:49–75` |
| Preload .env real | `preload-test-env.ts:8–21` |
| Unit runner exclude | `run-unit-tests.mjs:24` |
| Integration runner | `run-integration-tests.mjs:59–62` |
| CI SQL service | `quality-gate.yml:119–194` |
| Ephemeral CREATE DB | `ephemeral-billing-exemption-database.ts:293–314` |
| Junk cleanup | `cleanup-integration-junk.ts:1–17,58` |