/*
  Migration: 089_phase3_4_db_security_roles.sql
  Purpose (Phases 3 & 4 — DB security foundation):
    Create least-privilege database roles for application runtime and migrations.
    Does NOT create LOGIN/USER or passwords (those stay in secret manager / ops).

  Roles:
    - dinamic_app_runtime: SELECT/INSERT/UPDATE/DELETE on SCHEMA::dbo — no DDL, no schema EXECUTE
    - dinamic_app_migrations: DDL CREATE* + ALTER/DML on SCHEMA::dbo; EXECUTE only on known UDF(s)

  Ownership / idempotency:
    - Neither role → create both + grants (happy path).
    - Both roles already present with expected runtime SELECT on SCHEMA::dbo → no-op
      (heals environments where roles were created by integration probes without
      system_migrations registration; runner still records 089 once).
    - Exactly one role, or both without expected runtime SELECT → THROW SCHEMA_DRIFT
      (do not adopt foreign / partial roles).
    Rollback drops these roles; therefore 089 must be the creator for greenfield.

  Rerunnability: via system_migrations (apply once) + no-op when roles already match.
  Rollback: database/migrations/rollback/089_phase3_4_db_security_roles_rollback.sql

  Note: DBs that already applied an earlier 089 draft granting EXECUTE ON SCHEMA::dbo
  are corrected by 090_phase3_4_revoke_schema_execute.sql.
*/

USE dinamic_attendance;
GO

DECLARE @runtimeExists BIT = CASE
  WHEN EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE name = N'dinamic_app_runtime' AND type = 'R'
  ) THEN 1 ELSE 0 END;
DECLARE @migrationsExists BIT = CASE
  WHEN EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE name = N'dinamic_app_migrations' AND type = 'R'
  ) THEN 1 ELSE 0 END;
DECLARE @runtimeHasSelect BIT = CASE
  WHEN EXISTS (
    SELECT 1
    FROM sys.database_permissions p
    INNER JOIN sys.database_principals r ON r.principal_id = p.grantee_principal_id
    INNER JOIN sys.schemas s ON s.schema_id = p.major_id AND p.class_desc = N'SCHEMA'
    WHERE r.name = N'dinamic_app_runtime'
      AND s.name = N'dbo'
      AND p.permission_name = N'SELECT'
      AND p.state_desc = N'GRANT'
  ) THEN 1 ELSE 0 END;

IF @runtimeExists = 1 AND @migrationsExists = 0
BEGIN
    THROW 50089, 'SCHEMA_DRIFT: dinamic_app_runtime exists without dinamic_app_migrations; refusing partial/foreign role set.', 1;
END;

IF @runtimeExists = 0 AND @migrationsExists = 1
BEGIN
    THROW 50089, 'SCHEMA_DRIFT: dinamic_app_migrations exists without dinamic_app_runtime; refusing partial/foreign role set.', 1;
END;

IF @runtimeExists = 1 AND @migrationsExists = 1 AND @runtimeHasSelect = 0
BEGIN
    THROW 50089, 'SCHEMA_DRIFT: both security roles exist but dinamic_app_runtime lacks expected SCHEMA::dbo SELECT; refusing to adopt foreign roles.', 1;
END;

IF @runtimeExists = 1 AND @migrationsExists = 1 AND @runtimeHasSelect = 1
BEGIN
    /* Roles already match 089 contract — no-op (safe re-entry / orphan heal). */
    PRINT N'089: dinamic_app_runtime + dinamic_app_migrations already present with expected grants; skipping CREATE.';
END
ELSE
BEGIN
    CREATE ROLE dinamic_app_runtime AUTHORIZATION dbo;
    CREATE ROLE dinamic_app_migrations AUTHORIZATION dbo;

    /* Runtime: business DML only. No CREATE/ALTER/DROP. No broad EXECUTE. */
    GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO dinamic_app_runtime;

    /*
      Migrations: schema evolution + data backfills.
      Not db_owner / CONTROL. CREATE* are database-scoped; ALTER on schema covers ALTER TABLE / CREATE INDEX.
      No GRANT EXECUTE ON SCHEMA::dbo — only object-scoped EXECUTE where proven necessary.
    */
    GRANT CREATE TABLE TO dinamic_app_migrations;
    GRANT CREATE VIEW TO dinamic_app_migrations;
    GRANT CREATE PROCEDURE TO dinamic_app_migrations;
    GRANT CREATE FUNCTION TO dinamic_app_migrations;
    GRANT CREATE TYPE TO dinamic_app_migrations;
    GRANT ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO dinamic_app_migrations;

    /*
      Proven executable dependency (migrations 039/040 backfills / AT TIME ZONE helpers).
      Runtime does not call this UDF from application SQL.
    */
    IF OBJECT_ID(N'dbo.fn_resolve_operation_timezone_for_sql', N'FN') IS NOT NULL
    BEGIN
        GRANT EXECUTE ON OBJECT::dbo.fn_resolve_operation_timezone_for_sql TO dinamic_app_migrations;
    END;
END;
GO
