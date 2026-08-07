/*
  Migration: 089_phase3_4_db_security_roles.sql
  Purpose (Phases 3 & 4 — DB security foundation):
    Create least-privilege database roles for application runtime and migrations.
    Does NOT create LOGIN/USER or passwords (those stay in secret manager / ops).
    Does NOT revoke sa or change existing memberships (safe additive rollout).

  Roles:
    - dinamic_app_runtime: DML (+ EXECUTE for UDFs/future SPs) on SCHEMA::dbo — no DDL
    - dinamic_app_migrations: DDL CREATE* + ALTER/DML on SCHEMA::dbo for schema evolution

  Rollout (see audit/database-integrity-phase3-4-implementation.md):
    1) Apply this migration (as current privileged identity)
    2) Create SQL logins outside Git; CREATE USER …; ALTER ROLE … ADD MEMBER …
    3) Point migrations container at migration login; backend at runtime login
    4) Validate; then stop using sa for app/migrations

  Idempotent: CREATE ROLE guarded; GRANT is re-runnable.
  Rollback: database/migrations/rollback/089_phase3_4_db_security_roles_rollback.sql
*/

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'dinamic_app_runtime'
      AND type = 'R'
)
BEGIN
    CREATE ROLE dinamic_app_runtime AUTHORIZATION dbo;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'dinamic_app_migrations'
      AND type = 'R'
)
BEGIN
    CREATE ROLE dinamic_app_migrations AUTHORIZATION dbo;
END;
GO

/* Runtime: business DML only. No CREATE/ALTER/DROP membership. */
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO dinamic_app_runtime;
GRANT EXECUTE ON SCHEMA::dbo TO dinamic_app_runtime;
GO

/*
  Migrations: schema evolution + data backfills inside migration files.
  Intentionally not db_owner / CONTROL. CREATE* are database-scoped;
  ALTER on schema covers ALTER TABLE / CREATE INDEX on dbo objects.
*/
GRANT CREATE TABLE TO dinamic_app_migrations;
GRANT CREATE VIEW TO dinamic_app_migrations;
GRANT CREATE PROCEDURE TO dinamic_app_migrations;
GRANT CREATE FUNCTION TO dinamic_app_migrations;
GRANT CREATE TYPE TO dinamic_app_migrations;
GRANT ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::dbo TO dinamic_app_migrations;
GO
