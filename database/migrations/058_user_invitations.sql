-- User invitations with opaque hashed tokens (no plaintext tokens stored).
-- Additive / progressive-deploy friendly.
--
-- Rollback (manual, only before invitations are relied on in production):
--   DROP INDEX IF EXISTS IX_user_invitations_email_status ON user_invitations;
--   DROP INDEX IF EXISTS IX_user_invitations_company_status ON user_invitations;
--   DROP INDEX IF EXISTS UQ_user_invitations_company_email_pending ON user_invitations;
--   DROP INDEX IF EXISTS UQ_user_invitations_token_hash ON user_invitations;
--   DROP TABLE IF EXISTS user_invitations;
-- Do not drop the table automatically if it already contains live invitations.

USE dinamic_attendance;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_invitations')
BEGIN
    CREATE TABLE user_invitations (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_user_invitations PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        email_normalized NVARCHAR(255) NOT NULL,
        invitee_name NVARCHAR(150) NULL,
        role NVARCHAR(30) NOT NULL,
        invited_by_user_id UNIQUEIDENTIFIER NULL,
        target_user_id UNIQUEIDENTIFIER NULL,
        token_hash CHAR(64) NOT NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_user_invitations_status DEFAULT 'PENDING',
        origin NVARCHAR(40) NOT NULL,
        expires_at DATETIME2 NOT NULL,
        accepted_at DATETIME2 NULL,
        revoked_at DATETIME2 NULL,
        last_email_sent_at DATETIME2 NULL,
        last_email_error NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_user_invitations_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_user_invitations_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_user_invitations_company FOREIGN KEY (company_id) REFERENCES companies (id),
        CONSTRAINT FK_user_invitations_invited_by FOREIGN KEY (invited_by_user_id) REFERENCES users (id),
        CONSTRAINT FK_user_invitations_target_user FOREIGN KEY (target_user_id) REFERENCES users (id),
        CONSTRAINT CK_user_invitations_role CHECK (
            role IN ('OWNER', 'ADMIN', 'HR', 'SUPERVISOR', 'OPERATOR', 'READ_ONLY')
        ),
        CONSTRAINT CK_user_invitations_status CHECK (
            status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')
        ),
        CONSTRAINT CK_user_invitations_origin CHECK (
            origin IN ('MANUAL', 'COMPANY_CREATE', 'RESEND', 'ADMIN')
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_user_invitations_token_hash'
      AND object_id = OBJECT_ID('user_invitations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_user_invitations_token_hash
        ON user_invitations (token_hash);
END;
GO

-- At most one PENDING invitation per company + email.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_user_invitations_company_email_pending'
      AND object_id = OBJECT_ID('user_invitations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_user_invitations_company_email_pending
        ON user_invitations (company_id, email_normalized)
        WHERE status = 'PENDING';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_user_invitations_company_status'
      AND object_id = OBJECT_ID('user_invitations')
)
BEGIN
    CREATE INDEX IX_user_invitations_company_status
        ON user_invitations (company_id, status, created_at DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_user_invitations_email_status'
      AND object_id = OBJECT_ID('user_invitations')
)
BEGIN
    CREATE INDEX IX_user_invitations_email_status
        ON user_invitations (email_normalized, status);
END;
GO
