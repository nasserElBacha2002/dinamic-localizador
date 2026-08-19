/*
  Rollback: 099_users_two_factor_pending_secret_rollback.sql
  Drops pending TOTP secret columns. Manual only.
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_pending_created_at'
)
BEGIN
    ALTER TABLE dbo.users DROP COLUMN two_factor_pending_created_at;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_pending_secret_encrypted'
)
BEGIN
    ALTER TABLE dbo.users DROP COLUMN two_factor_pending_secret_encrypted;
END;
GO
