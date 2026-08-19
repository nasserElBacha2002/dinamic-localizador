/*
  Migration: 097_users_token_version_password_reset.sql
  Purpose:
    - Add users.token_version (auth epoch) so JWT sessions can be invalidated
      after password reset without a denylist.
    - Add user_password_reset_tokens (opaque SHA-256 hashes, single-use, TTL).

  Additive / progressive-deploy friendly.
  Rollback: database/migrations/rollback/097_users_token_version_password_reset_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    THROW 50097, 'Precondition failed: users missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users')
      AND name = N'token_version'
)
BEGIN
    ALTER TABLE dbo.users
        ADD token_version INT NOT NULL
            CONSTRAINT DF_users_token_version DEFAULT (0);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'user_password_reset_tokens')
BEGIN
    CREATE TABLE dbo.user_password_reset_tokens (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_user_password_reset_tokens PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2 NOT NULL,
        consumed_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_user_password_reset_tokens_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_password_reset_tokens_user
            FOREIGN KEY (user_id) REFERENCES dbo.users (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_user_password_reset_tokens_token_hash'
      AND object_id = OBJECT_ID(N'dbo.user_password_reset_tokens')
)
BEGIN
    CREATE UNIQUE INDEX UQ_user_password_reset_tokens_token_hash
        ON dbo.user_password_reset_tokens (token_hash);
END;
GO

-- At most one unconsumed reset token per user (rotation replaces the previous).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_user_password_reset_tokens_user_active'
      AND object_id = OBJECT_ID(N'dbo.user_password_reset_tokens')
)
BEGIN
    CREATE UNIQUE INDEX UQ_user_password_reset_tokens_user_active
        ON dbo.user_password_reset_tokens (user_id)
        WHERE consumed_at IS NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_user_password_reset_tokens_user_id'
      AND object_id = OBJECT_ID(N'dbo.user_password_reset_tokens')
)
BEGIN
    CREATE INDEX IX_user_password_reset_tokens_user_id
        ON dbo.user_password_reset_tokens (user_id, created_at DESC);
END;
GO
