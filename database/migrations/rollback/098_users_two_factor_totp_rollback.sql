/*
  Rollback: 098_users_two_factor_totp_rollback.sql
  Drops 2FA challenge/recovery tables then users TOTP columns.
  Manual only. Do not run if live 2FA enrollments must be preserved.
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.user_two_factor_login_challenges', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.user_two_factor_login_challenges;
END;
GO

IF OBJECT_ID(N'dbo.user_two_factor_recovery_codes', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.user_two_factor_recovery_codes;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = N'DF_users_two_factor_enabled'
      AND parent_object_id = OBJECT_ID(N'dbo.users')
)
BEGIN
    ALTER TABLE dbo.users DROP CONSTRAINT DF_users_two_factor_enabled;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_last_used_step'
)
BEGIN
    ALTER TABLE dbo.users DROP COLUMN two_factor_last_used_step;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_confirmed_at'
)
BEGIN
    ALTER TABLE dbo.users DROP COLUMN two_factor_confirmed_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_secret_encrypted'
)
BEGIN
    ALTER TABLE dbo.users DROP COLUMN two_factor_secret_encrypted;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_enabled'
)
BEGIN
    ALTER TABLE dbo.users DROP COLUMN two_factor_enabled;
END;
GO
