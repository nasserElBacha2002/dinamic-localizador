-- Ensure one company_settings row per company (idempotent; migration 015 may already define UQ_company_settings_company).
-- Rollback: DROP INDEX UQ_company_settings_company_id ON company_settings; (only if this migration created it)

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT company_id
    FROM company_settings
    GROUP BY company_id
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51000, 'Cannot create unique company_settings index: duplicate company settings rows exist.', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UQ_company_settings_company_id'
      AND object_id = OBJECT_ID('company_settings')
)
AND NOT EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE name = 'UQ_company_settings_company'
      AND parent_object_id = OBJECT_ID('company_settings')
)
BEGIN
    CREATE UNIQUE INDEX UQ_company_settings_company_id
    ON company_settings(company_id);
END;
GO
