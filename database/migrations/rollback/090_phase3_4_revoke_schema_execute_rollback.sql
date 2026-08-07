/*
  Rollback: 090_phase3_4_revoke_schema_execute_rollback.sql
  Restores schema-level EXECUTE grants from the pre-correction 089 draft (not recommended).
  Prefer staying on least-privilege object EXECUTE only.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = N'dinamic_app_runtime' AND type = 'R'
)
BEGIN
    GRANT EXECUTE ON SCHEMA::dbo TO dinamic_app_runtime;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = N'dinamic_app_migrations' AND type = 'R'
)
BEGIN
    GRANT EXECUTE ON SCHEMA::dbo TO dinamic_app_migrations;
END;
GO
