-- 138: Ensure global users.email uniqueness (idempotent).
-- Index originally created in 004_mvp_completion.sql as UQ_users_email.
-- Does not drop/reassign rows. Fails loud if historical duplicates exist.

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    THROW 50138, 'Precondition failed: users missing', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_users_email'
      AND object_id = OBJECT_ID(N'dbo.users')
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM dbo.users
        GROUP BY email
        HAVING COUNT(*) > 1
    )
    BEGIN
        THROW 50138, 'Cannot create UQ_users_email: duplicate emails exist', 1;
    END;

    CREATE UNIQUE INDEX UQ_users_email ON dbo.users (email);
END;
GO
