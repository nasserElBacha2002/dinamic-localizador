/*
  Migration: 098_users_two_factor_totp.sql
  Purpose:
    - Add TOTP 2FA columns on users (encrypted secret, enabled flag, last step).
    - Persist hashed recovery codes (single-use).
    - Persist hashed login challenges (single-use, short TTL).

  Additive.   Existing users remain two_factor_enabled = 0.
  Expired rows in user_two_factor_login_challenges are retained until a later cleanup job
  ("expired 2FA challenge retention/cleanup"). No worker is added in this migration.

  Rollback: database/migrations/rollback/098_users_two_factor_totp_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    THROW 50098, 'Precondition failed: users missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_enabled'
)
BEGIN
    ALTER TABLE dbo.users
        ADD two_factor_enabled BIT NOT NULL
            CONSTRAINT DF_users_two_factor_enabled DEFAULT (0);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_secret_encrypted'
)
BEGIN
    ALTER TABLE dbo.users
        ADD two_factor_secret_encrypted NVARCHAR(512) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_confirmed_at'
)
BEGIN
    ALTER TABLE dbo.users
        ADD two_factor_confirmed_at DATETIME2 NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'two_factor_last_used_step'
)
BEGIN
    ALTER TABLE dbo.users
        ADD two_factor_last_used_step BIGINT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'user_two_factor_recovery_codes')
BEGIN
    CREATE TABLE dbo.user_two_factor_recovery_codes (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_user_two_factor_recovery_codes PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        code_hash CHAR(64) NOT NULL,
        consumed_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_user_two_factor_recovery_codes_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_two_factor_recovery_codes_user
            FOREIGN KEY (user_id) REFERENCES dbo.users (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_user_two_factor_recovery_codes_hash'
      AND object_id = OBJECT_ID(N'dbo.user_two_factor_recovery_codes')
)
BEGIN
    CREATE UNIQUE INDEX UQ_user_two_factor_recovery_codes_hash
        ON dbo.user_two_factor_recovery_codes (code_hash);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_user_two_factor_recovery_codes_user_id'
      AND object_id = OBJECT_ID(N'dbo.user_two_factor_recovery_codes')
)
BEGIN
    CREATE INDEX IX_user_two_factor_recovery_codes_user_id
        ON dbo.user_two_factor_recovery_codes (user_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'user_two_factor_login_challenges')
BEGIN
    CREATE TABLE dbo.user_two_factor_login_challenges (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_user_two_factor_login_challenges PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2 NOT NULL,
        consumed_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_user_two_factor_login_challenges_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_two_factor_login_challenges_user
            FOREIGN KEY (user_id) REFERENCES dbo.users (id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_user_two_factor_login_challenges_hash'
      AND object_id = OBJECT_ID(N'dbo.user_two_factor_login_challenges')
)
BEGIN
    CREATE UNIQUE INDEX UQ_user_two_factor_login_challenges_hash
        ON dbo.user_two_factor_login_challenges (token_hash);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_user_two_factor_login_challenges_user_id'
      AND object_id = OBJECT_ID(N'dbo.user_two_factor_login_challenges')
)
BEGIN
    CREATE INDEX IX_user_two_factor_login_challenges_user_id
        ON dbo.user_two_factor_login_challenges (user_id, expires_at);
END;
GO
