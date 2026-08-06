/*
  Migration: 085_user_company_membership_default_unique.sql
  Purpose:
    - Ensure at most one default membership per user (filtered unique index)
    - Heal duplicate defaults before creating the index
  Rollback: database/migrations/rollback/085_user_company_membership_default_unique_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.user_company_memberships', N'U') IS NULL
BEGIN
    THROW 50085, 'Precondition failed: user_company_memberships missing', 1;
END;
GO

-- Keep the most recently updated default; clear older duplicates.
;WITH ranked_defaults AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
    FROM dbo.user_company_memberships
    WHERE is_default = 1
)
UPDATE m
SET
    m.is_default = 0,
    m.updated_at = SYSUTCDATETIME()
FROM dbo.user_company_memberships m
INNER JOIN ranked_defaults d ON d.id = m.id
WHERE d.rn > 1;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_user_company_memberships_user_default'
      AND object_id = OBJECT_ID(N'dbo.user_company_memberships')
)
BEGIN
    CREATE UNIQUE INDEX UQ_user_company_memberships_user_default
        ON dbo.user_company_memberships (user_id)
        WHERE is_default = 1;
END;
GO
