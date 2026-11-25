# SQL integration validation (DIN-463 — final closure)

## Mechanism (DIN-462)

- Runner: `backend/scripts/run-integration-tests.mjs`
- Ephemeral `din_test_<uuid>`, migrate all forward scripts, run `*.integration.test.ts`, teardown
- Requires `TEST_DB_*` (not habitual `DB_*`), `TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true`, `TEST_SQL_ALLOWED_SERVER_NAME` = `@@SERVERNAME`

## Local disposable instance (this pass)

| Variable | Value |
|----------|--------|
| `TEST_DB_HOST` | `localhost` |
| `TEST_DB_PORT` | `1433` |
| `TEST_DB_USER` | `din_integration` |
| `TEST_SQL_ALLOWED_SERVER_NAME` | `c60449e5dbda` |

**Blocker resolved:** Integration runner previously failed with `Refusing test SQL: login 'sa' is blocked` when only habitual `DB_*` was set. Fix: dedicated `din_integration` login + export `TEST_DB_*` (see `backend/.env.example`). Habitual `DB_PORT=1435` (compose) must not be used for disposable integration.

## Results (2026-11-25)

| Scope | Outcome |
|-------|---------|
| Full `npm run test:integration` | **884 pass / 0 fail / 0 skipped** (exit 0) |
| Migration forward | `175_commercial_seat_quota.sql` applied on ephemeral DB |
| DIN-463 commercial seat suites | pass (policy + concurrency) |
| Teardown | `din_test_cb6c1502-d750-42bc-9ac3-76dabc8950ef` destroyed |

## §4 matrix (via full integration suite)

Concurrent altas/reactivations/import, DISABLED/OBSERVE/ENFORCE, exemptions, unlimited capacity, missing contract, billing admin concurrency, ledger, multi-tenant isolation, pool limits, HTTP auth regression, employee/operation/attendance regressions — covered by existing integration files executed in the 158-file run (see `integration-run.log` TAP summary).

## Operator checklist (persist locally, do not commit secrets)

```bash
# 1) Server identity
docker exec sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<sa-password>' -C -Q "SELECT @@SERVERNAME"

# 2) In backend/.env (TEST block from .env.example)
TEST_DB_HOST=localhost
TEST_DB_PORT=1433
TEST_DB_USER=din_integration
TEST_DB_PASSWORD=<integration-login-password>
TEST_DB_ENCRYPT=false
TEST_DB_TRUST_SERVER_CERTIFICATE=true
TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true
TEST_SQL_ALLOWED_SERVER_NAME=<@@SERVERNAME>
```

If `din_integration` login fails, as `sa` on the disposable container only:

```sql
ALTER LOGIN [din_integration] WITH PASSWORD = '<new-strong-password>';
ALTER SERVER ROLE [dbcreator] ADD MEMBER [din_integration];
```

Run:

```bash
cd backend && npm run test:integration
```