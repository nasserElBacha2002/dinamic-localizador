/*
  Migration: 090_phase3_4_revoke_schema_execute.sql
  Purpose (Phase 3–4 corrections):
    Revoke broad EXECUTE ON SCHEMA::dbo from security roles if an earlier 089 draft granted it.
    Keep object-scoped EXECUTE only for proven migration UDF(s).
  Idempotent: REVOKE is safe when permission was never granted; object GRANT is re-runnable.
  Requires roles from 089 (skips quietly if roles absent — e.g. restored DB without 089).
  Rollback: database/migrations/rollback/090_phase3_4_revoke_schema_execute_rollback.sql
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = N'dinamic_app_runtime' AND type = 'R'
)
BEGIN
    REVOKE EXECUTE ON SCHEMA::dbo FROM dinamic_app_runtime;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = N'dinamic_app_migrations' AND type = 'R'
)
BEGIN
    REVOKE EXECUTE ON SCHEMA::dbo FROM dinamic_app_migrations;

    IF OBJECT_ID(N'dbo.fn_resolve_operation_timezone_for_sql', N'FN') IS NOT NULL
    BEGIN
        GRANT EXECUTE ON OBJECT::dbo.fn_resolve_operation_timezone_for_sql TO dinamic_app_migrations;
    END;
END;
GO
