/*
  Rollback: 089_phase3_4_db_security_roles_rollback.sql
  Removes Phase 3/4 security roles after clearing memberships.
  Does not drop SQL logins (server-level; managed outside migrations).
  Warning: only run if no production users depend on these roles.
*/

USE dinamic_attendance;
GO

DECLARE @sql NVARCHAR(MAX);

-- Drop role members first (SQL Server requires empty roles).
WHILE EXISTS (
    SELECT 1
    FROM sys.database_role_members rm
    INNER JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
    WHERE r.name IN (N'dinamic_app_runtime', N'dinamic_app_migrations')
)
BEGIN
    SELECT TOP (1)
        @sql = N'ALTER ROLE ' + QUOTENAME(r.name) + N' DROP MEMBER ' + QUOTENAME(m.name) + N';'
    FROM sys.database_role_members rm
    INNER JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
    INNER JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id
    WHERE r.name IN (N'dinamic_app_runtime', N'dinamic_app_migrations');

    EXEC sys.sp_executesql @sql;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = N'dinamic_app_runtime' AND type = 'R'
)
BEGIN
    DROP ROLE dinamic_app_runtime;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.database_principals WHERE name = N'dinamic_app_migrations' AND type = 'R'
)
BEGIN
    DROP ROLE dinamic_app_migrations;
END;
GO
