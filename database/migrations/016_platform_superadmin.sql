-- Platform superadmin flag (separate from company memberships).
-- Backfills admin@dinamicsystems.com only; idempotent for SQL Server.

USE dinamic_attendance;
GO

IF COL_LENGTH('users', 'is_platform_admin') IS NULL
BEGIN
    ALTER TABLE users
        ADD is_platform_admin BIT NOT NULL
            CONSTRAINT DF_users_is_platform_admin DEFAULT 0;
END;
GO

UPDATE users
SET is_platform_admin = 1
WHERE LOWER(email) = LOWER(N'admin@dinamicsystems.com')
  AND is_platform_admin <> 1;
GO
