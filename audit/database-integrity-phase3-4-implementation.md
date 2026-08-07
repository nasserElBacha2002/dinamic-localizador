# Database Integrity Phases 3 & 4

## Administrative Atomicity and DB Security Hardening

### 1. Executive Summary

Estado: **COMPLETE_WITH_ISSUES**

| Layer | Status |
|-------|--------|
| Least-privilege **foundation** (roles + effective-permission tests) | **FOUNDATION_COMPLETE** |
| Production identity cutover off `sa` | **PRODUCTION_CUTOVER_PENDING** |

Phases 3 and 4 were driven by repository evidence, not by a mandate to create stored procedures or force EXECUTE-only.

| Area | Decision |
|------|----------|
| Business workflows (attendance, absences, payroll, WhatsApp, invites) | **KEEP_APPLICATION_TRANSACTION** — no SPs |
| Company purge (DB stages) | **KEEP_APP_TRANSACTION** — already staged TX + GCS outbox; SP would not remove runtime DELETE need |
| Repair / reconcile / backfill CLIs | **KEEP_SCRIPT** — recurring ops scripts stay TypeScript; SP alone does not reduce privilege until admin identity exists |
| Full EXECUTE-only runtime | **REJECTED** — raw SQL across repositories; rewrite cost ≫ benefit |
| Least-privilege roles | **IMPLEMENTED**: `dinamic_app_runtime`, `dinamic_app_migrations` via `089` (+ `090` revoke schema EXECUTE if prior draft) |
| Runtime EXECUTE | **none** (no `EXECUTE ON SCHEMA::dbo`) |
| Migration EXECUTE | **object-only**: `dbo.fn_resolve_operation_timezone_for_sql` |
| Credential split | **pair required**: both `DB_MIGRATION_*` set, or both unset; XOR → config error |
| Cutover off `sa` | **Runbook only** — residual operational **P1** until ops maps dedicated logins |

**COMPLETE_WITH_ISSUES** because default compose still documents/uses shared `sa` until operators complete cutover. Foundation permissions are proven with `CREATE USER WITHOUT LOGIN` + `EXECUTE AS USER` (not only skipped login tests).

See also: `audit/database-integrity-phase3-4-corrections.md`.

---

### 1b. Runtime role exact permissions

```text
SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo
EXECUTE: none
DDL: none
```

### 1c. Removed broad EXECUTE

Prior draft granted `EXECUTE ON SCHEMA::dbo` to runtime (and migrations). That would auto-entitle future admin procedures. Removed in corrected `089`; `090` revokes schema EXECUTE on already-applied DBs.

### 1d. Migration role exact permissions

```text
CREATE TABLE, VIEW, PROCEDURE, FUNCTION, TYPE
ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo
EXECUTE ON OBJECT::dbo.fn_resolve_operation_timezone_for_sql (if present)
```

### 1e. Credential pair semantics

Shared mode: both migration vars unset/whitespace → `DB_USER`/`DB_PASSWORD`.  
Dedicated mode: both set → migration identity.  
Partial pair → `MigrationCredentialConfigError` (never reuse runtime password silently).

Compose passes `DB_MIGRATION_*` through; **Node (`env-migrations` / resolver) is the only resolver**.

### 1f. Role effective-permission test matrix

See corrections report § matrix. CI suite: `phase3-4-db-security.integration.test.ts` (WITHOUT LOGIN). Optional ops smoke: `RUN_DB_PRIVILEGE_TESTS`.

### 1g. 089 forward/rollback/forward + schema drift

- Forward creates roles only when absent; preexisting → `THROW 50089 SCHEMA_DRIFT`.
- Rollback drops members then roles.
- Integration covers forward → rollback → forward and drift without partial grants.

### 1h. Production cutover status

**FOUNDATION_COMPLETE** / **PRODUCTION_CUTOVER_PENDING**. Do not claim least privilege active in production until backend + migrations stop using `sa`.

---

### 2. Current DB identities

| Identity | Source | Purpose |
|----------|--------|---------|
| SQL Server `sa` | `MSSQL_SA_PASSWORD=${DB_PASSWORD}` in Compose; healthcheck/`db-init` use `sa` | Instance bootstrap |
| Application / migrations (shared) | `DB_USER` / `DB_PASSWORD` (examples default `sa`) | Backend pool + migration runner historically share one login |
| Optional migration pair | `DB_MIGRATION_USER` + `DB_MIGRATION_PASSWORD` (both or neither) | Dedicated migration runner identity |

No LOGIN/USER/PASSWORD is created in versioned migrations (by design).

Secrets: not printed; `.env` remains gitignored; examples use empty placeholders.

---

### 3. Current privilege model

| Finding | Evidence | Severity |
|---------|----------|----------|
| Runtime + migrations share one SQL login | `env.ts`, `env-migrations.ts` (pre-change), Compose both pass `DB_USER` | P1 / P2 |
| Default identity is `sa` | `.env.example`, Compose healthcheck | P1 |
| No database roles for app before 089 | Grep: no prior `CREATE ROLE` / `GRANT` in migrations | P2 |
| No project `CREATE PROCEDURE` | Migrations inventory | — |
| Prod SQL not published | `docker-compose.prod.yml` `ports: !override []` | Positive |
| Dev SQL published | `1435:1433` on host | P2 (local only) |
| Encrypt defaults off | `DB_ENCRYPT=false`, `DB_TRUST_SERVER_CERTIFICATE=true` | P2 for remote; acceptable on private Docker network if documented |

---

### 4. Runtime write-path matrix

| Write path | Runtime/Admin | Tables (summary) | Transaction | SQL directo | Candidate SP | Security impact |
|------------|---------------|------------------|-------------|-------------|--------------|-----------------|
| HTTP API (CRUD ops, employees, …) | Runtime | Many dbo tables | Per-service TX | Parametrized repo SQL | No | Broad DML needed |
| Attendance check-in/out | Runtime | attendance, sessions, … | App TX + Phase 0A | Repo SQL | **KEEP_APP** | Domain orchestration |
| Absence approve/reject | Runtime | absences, balances, … | App TX + H1 | Repo SQL | **KEEP_APP** | Domain |
| Attachment approve | Runtime | attachments | App TX + H3 | Repo SQL | **KEEP_APP** | Domain |
| Payroll upload/replace | Runtime | payroll_* | App TX | Repo SQL | **KEEP_APP** | Domain |
| Invitation accept/role | Runtime | memberships, invites, audit | App TX + Phase 2 | Repo SQL | **KEEP_APP** | Domain |
| WhatsApp webhook | Runtime | messages, sessions, attendance | App TX + idempotency | Repo SQL | **KEEP_APP** | External I/O |
| Reminder / materialization jobs | Runtime | notifications, workdays | Job TX | Repo SQL | No | Same DML surface |
| Company deactivate/reactivate | Runtime | companies, memberships, lifecycle | TX + `sp_getapplock` | Service SQL | No | Already atomic |
| Company purge STORAGE_* | Runtime job | pending_storage_deletion + GCS | Not DB-global | Service | **No SP** (GCS) | Side effects outside SQL |
| Company purge OPERATIONAL/IDENTITY | Runtime job | Dozens of tenant tables | Per-stage `sql.Transaction` | Set-based deletes | **KEEP_APP** | Needs DELETE |
| Migration runner | Migration identity | Schema + `system_migrations` | One TX per file (Phase 1) | DDL scripts | N/A | Needs DDL |
| reconcile/repair/backfill scripts | Admin/CLI | Targeted tables | Script-defined | TS + SQL | **KEEP_SCRIPT** | Same login as app today |
| Seeds / admin:create | Admin/CLI | users, services, … | Script | TS | **KEEP_SCRIPT** | Elevated |
| Manual SQL | Operator | Any | Ad hoc | Direct | N/A | Highest risk if `sa` |

---

### 5. Stored procedure candidates

| Candidate | Classification |
|-----------|----------------|
| Attendance / checkout / geofence | KEEP_APPLICATION_TRANSACTION |
| Absence / payroll / invites / WhatsApp | KEEP_APPLICATION_TRANSACTION |
| Company purge (full pipeline) | KEEP_APPLICATION_TRANSACTION (staged + GCS) |
| Company purge DB-only stage only | SP_OPTIONAL → **NO_CHANGE** (app TX already clear; SP does not shrink runtime DML) |
| Reconcile services / absence ledger | KEEP_SCRIPT |
| Repair operation-reassignment / location duplicates / schedule drift | KEEP_SCRIPT |
| Absence balance backfill | KEEP_SCRIPT (already TS + integration tests) |
| Generic “admin maintenance” wrapper | NO_CHANGE |

---

### 6. Stored procedure decisions

| Candidate | Current flow | Benefit | Cost | Security gain | Decision |
|-----------|--------------|---------|------|---------------|----------|
| Check-in / checkout / review | TS TX + constraints + Phase 2 audit | Low | Dual logic | None | **KEEP_APP_TRANSACTION** |
| Company purge DB stages | Staged TS TX + lease | Marginal atomicity (already TX) | Duplicate cascade SQL; GCS stays out | None until EXECUTE-only admin | **KEEP_APP_TRANSACTION** |
| usp_company_purge_database_stage | — | Would encapsulate deletes | Large SP, lock/log risk on big tenants | Low while runtime keeps DELETE | **NO_CHANGE** |
| Repair/reconcile CLIs | One-off / ops TS | Operator EXEC UX | Rewrite + drift | Only with admin role + revoke DML | **KEEP_SCRIPT** / **DEFER** SP |
| Full EXECUTE-only | Raw SQL repos | Narrow surface | Rewrite entire data layer | High in theory | **REJECTED** |

---

### 7. Implemented SPs

**None.**

Rationale: no candidate met `SP_STRONG_CANDIDATE` with demonstrated atomicity/security gain over existing application transactions.

---

### 8. SP atomicity/concurrency tests

**N/A** — no SPs implemented.

Phase 0A / purge lease / applock tests from prior phases remain the concurrency story for admin lifecycle.

---

### 9. Runtime permission model

| Capability | Decision |
|------------|----------|
| SELECT / INSERT / UPDATE / DELETE on `SCHEMA::dbo` | Required (repos + purge) |
| EXECUTE on `SCHEMA::dbo` | **Revoked / never granted** (corrections) |
| EXECUTE on specific objects | **None** for runtime (no app UDF/proc calls) |
| CREATE / ALTER / DROP (DDL) | **Not** granted |
| `db_owner` / `sysadmin` / `CONTROL` | Must not be used by runtime after cutover |
| Full EXECUTE-only | **REJECTED** |

Role: `dinamic_app_runtime` (migration `089`).

---

### 10. Migration permission model

| Capability | Decision |
|------------|----------|
| CREATE TABLE/VIEW/PROCEDURE/FUNCTION/TYPE | Granted to `dinamic_app_migrations` |
| ALTER / REFERENCES / DML on `SCHEMA::dbo` | Granted (backfills + FK work) |
| EXECUTE on `SCHEMA::dbo` | **Not** granted |
| EXECUTE on `dbo.fn_resolve_operation_timezone_for_sql` | Granted when object exists |
| `db_owner` / `sysadmin` | Not used by role definition |
| Identity | Dedicated login via paired `DB_MIGRATION_*`; else shared `DB_*` |

Preserve Phase 1: one transaction per migration file + `system_migrations` registration.

---

### 11. Admin maintenance permission model

| Decision | Detail |
|----------|--------|
| `dinamic_app_admin_maintenance` | **DEFERRED** — no admin SPs yet; empty EXECUTE-only role adds no value |
| Current repair CLIs | Continue under migration or ops identity with DML; document risk |
| Future | If a recurring DB-only reconcile becomes EXEC-worthy, add SP + EXECUTE grant to admin role, then revoke ad hoc DML from operators |

---

### 12. Credential/deployment strategy

**Rollout (never REVOKE first):**

1. Apply migration `089` (creates roles + GRANTs).
2. Outside Git: create SQL logins with strong passwords (secret manager).
3. `CREATE USER … FOR LOGIN …` in `dinamic_attendance`.
4. `ALTER ROLE dinamic_app_runtime ADD MEMBER <runtime_user>;`
5. `ALTER ROLE dinamic_app_migrations ADD MEMBER <migration_user>;`
6. Set `DB_USER`/`DB_PASSWORD` = runtime; `DB_MIGRATION_USER`/`DB_MIGRATION_PASSWORD` = migrations.
7. Deploy migrations service → backend; validate health + smoke business write.
8. Disable/stop using `sa` for app and migrations (keep `sa` only for break-glass / SQL container bootstrap).

**Rollback (security):**

- Re-point env to previous login (often `sa`) — restores connectivity.
- Role DROP only via `089` rollback script if no users depend on roles.
- Do not “roll back” to insecure as a habit; treat as emergency.

**Credential rotation:** create new login → map role → switch env → validate → disable old login. Never store passwords in SQL migrations.

---

### 13. Network/SQL exposure

| Environment | Exposure | Classification |
|-------------|----------|----------------|
| Local Compose | Host `1435:1433` | LOCAL_DEV — acceptable; do not publish unnecessarily on shared networks |
| Prod overlay | Ports overridden empty | PRIVATE_NETWORK — SQL internal to Compose network |
| Encryption | Default `DB_ENCRYPT=false` | Fine on single-host Docker network; enable encrypt for remote SQL |

No new ports opened in this phase.

---

### 14. Dangerous SQL Server features

Integration test reads (does not mutate) `xp_cmdshell`, OLE Automation, CLR, Ad Hoc Distributed Queries, and database `TRUSTWORTHY`.

Policy:

- Do not enable `xp_cmdshell` / OLE / HTTP from SQL.
- No audit triggers (Phase 2 decision stands).
- No `EXECUTE AS OWNER` introduced.

Instance hardening is ops-owned when the project controls the SQL instance; do not flip flags blindly on shared servers.

---

### 15. Security tests

| Test | Mode | Result expectation |
|------|------|--------------------|
| `migration-db-credentials.test.ts` | Unit | Credential resolution fallback / dedicated |
| `phase3-4-db-security.integration.test.ts` | `RUN_DB_INTEGRATION_TESTS=true` | Roles exist; schema GRANTs present; dangerous feature probe (read-only) |
| Runtime ALTER/DROP denial | `RUN_DB_PRIVILEGE_TESTS=true` + `DB_PRIVILEGE_TEST_USER`/`PASSWORD` | Optional; skipped until dedicated runtime login exists |

Denial tests are **not** claimed against `sa` (would pass wrongly).

---

### 16. Migration/rollback strategy

| Artifact | Role |
|----------|------|
| `089_phase3_4_db_security_roles.sql` | Forward: roles + grants |
| `rollback/089_phase3_4_db_security_roles_rollback.sql` | Drop members then roles |
| Runner | Unchanged atomicity (Phase 1) |

Schema rollback ≠ security rollback (see §12).

---

### 17. Performance considerations

Large company purge already **batched by stage** (storage then operational TX then identity TX). A single mega-SP delete would worsen lock escalation and transaction log pressure → supports **NO_CHANGE** for purge SP.

---

### 18. NO_CHANGE decisions

| Topic | Decision |
|-------|----------|
| Business → SP | NO_CHANGE / KEEP_APP |
| Purge → SP | NO_CHANGE |
| Repair scripts → SP | KEEP_SCRIPT (SP deferred) |
| EXECUTE-only runtime | REJECTED |
| Admin EXECUTE role | DEFERRED |
| SESSION_CONTEXT for audit | Not introduced (pool reuse risk) |
| DENY statements | Not used |
| Frontend / admin UI for SPs | Not in scope |
| Auto-revoke `sa` | Not done (rollout safety) |

---

### 19. Remaining risks

| Risk | Before | After | Residual risk | Follow-up |
|------|--------|-------|---------------|-----------|
| Runtime uses `sa` / shared login | Default | Roles + env split ready; cutover optional | **P1** until dedicated logins mapped | Ops runbook §12 |
| Runtime DML breadth (incl. DELETE) | Full via `sa` | Same DML on role after cutover | Direct SQL still possible with stolen runtime creds | Accept; constraints + audit remain |
| Admin scripts need broad DML | Yes | Unchanged | Operator mistake | DEFER admin SPs if ops demand |
| Dev SQL port published | Yes | Unchanged | Local exposure | Keep prod unpublished |
| `DB_ENCRYPT=false` | Default | Documented | MITM if SQL remote | Enable when SQL is remote |
| ORDER BY allowlists in repos | Dynamic column names from code maps | Unchanged | Injection if map ever takes raw input | Keep allowlists; no change this phase |

---

### 20. Validation

See `audit/implementation-phase3-4-validation.txt` for command exit codes.

Expected commands:

- `cd backend && npm run build`
- Unit: `migration-db-credentials` (+ full unit suite if run)
- `docker compose config` (may warn on unset local env; prod overlay validates port override)
- Integration: `phase3-4-db-security.integration.test.ts` when SQL available

---

## Obligatory SP decision table

| Candidate | Decision | Why | Atomicity gain | Security gain | Tests |
|-----------|----------|-----|----------------|---------------|-------|
| Attendance / WhatsApp / payroll / invites / absences | KEEP_APP_TRANSACTION | Domain orchestration | None (already TX) | None | Prior phase suites |
| Company purge DB stages | KEEP_APP_TRANSACTION | Staged TX + GCS | None material | None without EXECUTE-only | Existing purge/lease |
| usp_company_purge_database_stage | NO_CHANGE | Cost > benefit | Low | Low | N/A |
| Repair/reconcile/backfill CLIs | KEEP_SCRIPT | Ops TS; not DB-only contracts | N/A | Low today | Existing script tests |
| Full EXECUTE-only | REJECTED | Rewrite all repos | N/A | Theoretical only | N/A |

---

## Obligatory permissions table

| Identity | SELECT | INSERT | UPDATE | DELETE | EXECUTE | DDL | Decision |
|----------|--------|--------|--------|--------|---------|-----|----------|
| Runtime (`dinamic_app_runtime`) | dbo schema | dbo | dbo | dbo | **none** | No | Proven via EXECUTE AS tests |
| Migrations (`dinamic_app_migrations`) | dbo | dbo | dbo | dbo | **object:** `fn_resolve_operation_timezone_for_sql` | CREATE* + ALTER schema | Proven via EXECUTE AS tests |
| Admin maintenance | — | — | — | — | Future SPs only | No | DEFERRED |
| `sa` (bootstrap) | All | All | All | All | All | All | Break-glass / container bootstrap until cutover |

---

## Code / config delivered this phase

- `database/migrations/089_phase3_4_db_security_roles.sql`
- `database/migrations/rollback/089_phase3_4_db_security_roles_rollback.sql`
- `backend/src/config/migration-db-credentials.ts` (+ unit tests)
- `backend/src/config/env-migrations.ts` (optional dedicated migration identity)
- `backend/src/database/phase3-4-db-security.integration.test.ts`
- Compose / `.env.example` documentation for `DB_MIGRATION_*`

---

## Priorities summary

| ID | Finding | Action |
|----|---------|--------|
| P1 | Shared `sa` for app | Runbook cutover; roles ready |
| P2 | Runtime/migration same identity | Optional `DB_MIGRATION_*` + Compose wiring |
| P2 | Dev SQL published | Document; prod already internal |
| P3 | Optional admin SPs for repair | DEFER until ops asks |
| — | EXECUTE-only | REJECTED with evidence |
