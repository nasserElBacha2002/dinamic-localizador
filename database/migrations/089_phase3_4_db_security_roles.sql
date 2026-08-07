/*
  Migration: 089_phase3_4_db_security_roles.sql
  Purpose (Phases 3 & 4 — DB security foundation):
    Create least-privilege database roles for application runtime and migrations.
    Does NOT create LOGIN/USER or passwords (those stay in secret manager / ops).

  Roles:
    - dinamic_app_runtime: SELECT/INSERT/UPDATE/DELETE on SCHEMA::dbo — no DDL, no schema EXECUTE
    - dinamic_app_migrations: DDL CREATE* + ALTER/DML on SCHEMA::dbo; EXECUTE only on known UDF(s)

  Ownership:
    Roles must not pre-exist. If they do, THROW SCHEMA_DRIFT (do not adopt foreign roles).
    Rollback drops these roles; therefore 089 must be the creator.

  Rerunnability: via system_migrations (apply once). Re-running this script after success is blocked by preflight.
  Rollback: database/migrations/rollback/089_phase3_4_db_security_roles_rollback.sql

  Note: DBs that already applied an earlier 089 draft granting EXECUTE ON SCHEMA::dbo
  are corrected by 090_phase3_4_revoke_schema_execute.sql.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'dinamic_app_runtime'
      AND type = 'R'
)
BEGIN
    THROW 50089, 'SCHEMA_DRIFT: dinamic_app_runtime already exists; refusing to adopt a pre-existing role. Drop it only via 089 rollback if this migration owns it.', 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.database_principals
    WHERE name = N'dinamic_app_migrations'
      AND type = 'R'
)
BEGIN
    THROW 50089, 'SCHEMA_DRIFT: dinamic_app_migrations already exists; refusing to adopt a pre-existing role. Drop it only via 089 rollback if this migration owns it.', 1;
END;
GO

CREATE ROLE dinamic_app_runtime AUTHORIZATION dbo;
GO

CREATE ROLE dinamic_app_migrations AUTHORIZATION dbo;
GO

/* Runtime: business DML only. No CREATE/ALTER/DROP. No broad EXECUTE (future admin SPs stay denied). */
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO dinamic_app_runtime;
GO

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
GO

/*
  Proven executable dependency (migrations 039/040 backfills / AT TIME ZONE helpers).
  Runtime does not call this UDF from application SQL.
*/
IF OBJECT_ID(N'dbo.fn_resolve_operation_timezone_for_sql', N'FN') IS NOT NULL
BEGIN
    GRANT EXECUTE ON OBJECT::dbo.fn_resolve_operation_timezone_for_sql TO dinamic_app_migrations;
END;
GO
