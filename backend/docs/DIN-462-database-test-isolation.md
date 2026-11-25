# DIN-462 — Aislamiento de base de datos para tests

## Resumen

- **`npm test`** (backend): solo unit tests, sin SQL real (credenciales placeholder + `describeDatabaseIntegration` en skip).
- **`npm run test:integration`**: crea **`din_test_<uuid>`**, aplica migraciones, seed CI, ejecuta suites, destruye la BD al finalizar (éxito, fallo o SIGINT).
- Credenciales SQL de tests: **`TEST_DB_*`** (nunca `DB_*` de `backend/.env`).
- No hay runner E2E en el monorepo; cualquier E2E futuro con SQL debe reutilizar este mecanismo.

## Variables de entorno (integración)

| Variable | Descripción |
|----------|-------------|
| `TEST_DB_HOST` | Host SQL desechable |
| `TEST_DB_PORT` | Puerto (ej. `1433`) |
| `TEST_DB_USER` | Login con `CREATE DATABASE` en instancia de test |
| `TEST_DB_PASSWORD` | Password del login de test |
| `TEST_DB_ENCRYPT` | Opcional, default `false` |
| `TEST_DB_TRUST_SERVER_CERTIFICATE` | Opcional, default `true` |
| `TEST_SQL_ALLOWED_SERVER_NAME` | Obligatorio recomendado si el host no es loopback |
| `TEST_SQL_PROTECTED_DATABASE_NAMES` | Lista extra de BDs persistentes protegidas |
| `INTEGRATION_SQL_DDL_ALLOWED` | `true` para DDL de test |
| `INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED` | `true` para suites billing `din406_bce_*` |

## Local

```bash
cd backend
export TEST_DB_HOST=localhost
export TEST_DB_PORT=1433
export TEST_DB_USER=sa
export TEST_DB_PASSWORD='...'
export JWT_SECRET='local-test-jwt-secret-16+'
npm run test:integration
```

Si falta `TEST_DB_*` o la configuración apunta a una BD protegida, el runner **aborta antes de escribir**.

## Concurrencia

Cada ejecución de `test:integration` crea su propia `din_test_<uuid>`. Dos procesos en paralelo no comparten base.

## Limpieza y huérfanas

- Teardown automático al cerrar `run-integration-tests.mjs`.
- Recuperación manual (dry-run por defecto):

```bash
npm run test:db-recover-orphans
npm run test:db-recover-orphans -- --execute
```

Solo elimina nombres verificados (`din_test_<uuid>` o `din406_bce_<digits>`) más antiguos que `TEST_SQL_ORPHAN_MAX_AGE_MINUTES` (default 180), tras validar identidad del servidor.

## Datos históricos

```bash
# Solo contra BD de desarrollo explícita (no sesión efímera)
npm run test:audit-historical-candidates
```

Read-only; no ejecuta DELETE.

## CI

Job `backend-integration` en `quality-gate.yml`: contenedor SQL + `TEST_DB_*` + `npm run test:integration` (sin `dinamic_attendance` compartida).

## Limitaciones residuales

- Migración completa por run aumenta duración de CI.
- `audit-historical-test-data-candidates` requiere conexión explícita a la BD de análisis (no corre en unit/efímero por diseño).
- Validación de integridad byte-a-byte de la BD habitual requiere baseline opcional local (`PERSISTENT_DB_VERIFY_*`, no habilitado en CI).