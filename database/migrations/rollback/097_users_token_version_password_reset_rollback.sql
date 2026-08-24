/*
  Rollback: 097_users_token_version_password_reset_rollback.sql
  Drops password-reset tokens then users.token_version.
  Manual only. Do not run if live reset tokens must be preserved.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.user_password_reset_tokens', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.user_password_reset_tokens;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE name = N'DF_users_token_version'
      AND parent_object_id = OBJECT_ID(N'dbo.users')
)
BEGIN
    ALTER TABLE dbo.users DROP CONSTRAINT DF_users_token_version;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users')
      AND name = N'token_version'
)
BEGIN
    ALTER TABLE dbo.users DROP COLUMN token_version;
END;
GO
