# Database Integrity Phases 3 & 4 — Corrections

## Status

**COMPLETE_WITH_ISSUES** (unchanged overall)

| Layer | Status |
|-------|--------|
| Least-privilege **foundation** (roles + effective tests) | **FOUNDATION_COMPLETE** |
| Production cutover off `sa` | **PRODUCTION_CUTOVER_PENDING** (ops) |

Architecture decisions preserved: no business SPs, purge KEEP_APP, repair KEEP_SCRIPT, EXECUTE-only REJECTED, admin maintenance role DEFERRED.

---

## Review items

| # | Feedback | Action | Verified |
|---|----------|--------|----------|
| 1 | Remove runtime `EXECUTE ON SCHEMA::dbo` | Removed in `089`; `090` revokes if prior draft applied | Integration: schema EXECUTE false; future proc DENIED |
| 2 | Migration schema EXECUTE | Removed; object EXECUTE only on `fn_resolve_operation_timezone_for_sql` | Integration grant + migration DDL suite |
| 3 | Credential pair required | `resolveMigrationDbCredentials` errors on XOR / blank password | 6 unit tests |
| 4 | Compose dual resolution | Pass-through `DB_MIGRATION_*`; Node is sole resolver | Compose files |
| 5 | Effective permission tests without external login | `CREATE USER WITHOUT LOGIN` + `EXECUTE AS USER` | 7 integration pass, 1 ops skip |
| 6 | 089 ownership / drift | Strict SCHEMA_DRIFT if roles pre-exist | Drift + rollback/forward tests |
| 7 | Reports | This file + updated implementation md | — |

---

## Runtime role exact permissions

```text
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO dinamic_app_runtime;
```

EXECUTE: **none** (no project runtime procedures; `sp_getapplock` remains public/system).

---

## Removed broad EXECUTE

- Runtime: no schema EXECUTE → future `dbo.*` admin procs stay denied by default.
- Migrations: no schema EXECUTE → only proven UDF object grant.

Correction path for DBs that applied the earlier 089 draft: migration **`090_phase3_4_revoke_schema_execute.sql`**.

---

## Migration role exact permissions

```text
CREATE TABLE / VIEW / PROCEDURE / FUNCTION / TYPE
ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo
EXECUTE ON OBJECT::dbo.fn_resolve_operation_timezone_for_sql  (if present)
```

---

## Credential pair semantics

| Config | Result |
|--------|--------|
| both unset / whitespace | shared `DB_USER` + `DB_PASSWORD` |
| both set (non-blank) | dedicated migration identity |
| user only / password only / whitespace password with user | `MigrationCredentialConfigError` (no password in message) |

Single source of truth: `migration-db-credentials.ts` (Zod does not duplicate pair logic).

---

## Role effective-permission test matrix

| Principal | Operation | Expected |
|-----------|-----------|----------|
| runtime test user | SELECT/INSERT/UPDATE/DELETE on probe table | PASS |
| runtime | CREATE / ALTER / DROP | DENIED + metadata unchanged |
| runtime | `EXEC dbo.phase34_admin_probe` | DENIED |
| migrations test user | CREATE/ALTER/INDEX/INSERT/UPDATE/DROP probe | PASS |
| migrations | INSERT/SELECT/DELETE probe row in `system_migrations` | PASS (cleaned) |
| — | 089 forward → rollback → forward | PASS |
| — | preexisting role → SCHEMA_DRIFT | PASS |
| real login smoke | optional `RUN_DB_PRIVILEGE_TESTS` | SKIP until ops |

---

## 089 schema drift behavior

If `dinamic_app_runtime` or `dinamic_app_migrations` already exists when 089 runs → **THROW 50089 SCHEMA_DRIFT** before creating the other role or granting permissions.

---

## Production cutover status

Still pending. Smoke checklist for ops:

1. Runtime login: health, login, employee read, safe business write  
2. Migration login: `migrate:status`, apply next controlled migration  
3. Then remove `sa` from backend + migrations env (keep `sa` for SQL container bootstrap/healthcheck if required)

---

## Remaining operational P1

Application still defaults to shared `sa` until cutover. Foundation roles and tests are complete; do **not** claim least privilege active in production.
