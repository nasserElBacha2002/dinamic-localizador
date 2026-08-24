/*
  Migration: 099_users_two_factor_pending_secret.sql
  Purpose:
    - Separate reconfiguration/enrollment pending TOTP secret from the active secret.
    - Stamp pending creation so TWO_FACTOR_SETUP_TTL_MINUTES can expire abandoned setups.

  Additive. Does not change 097/098.
  Admin 2FA recovery is intentionally not modeled (no two_factor_recovery_required).
  Rollback: database/migrations/rollback/099_users_two_factor_pending_secret_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    THROW 50099, 'Precondition failed: users missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_pending_secret_encrypted'
)
BEGIN
    ALTER TABLE dbo.users
        ADD two_factor_pending_secret_encrypted NVARCHAR(512) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_pending_created_at'
)
BEGIN
    ALTER TABLE dbo.users
        ADD two_factor_pending_created_at DATETIME2 NULL;
END;
GO
