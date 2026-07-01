-- Unique company name constraint (case sensitivity follows DB collation).
-- Rollback: DROP INDEX UQ_companies_name ON companies;

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT name
    FROM companies
    GROUP BY name
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51000, 'Cannot create unique company name index: duplicate company names exist.', 1;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UQ_companies_name'
      AND object_id = OBJECT_ID('companies')
)
BEGIN
    CREATE UNIQUE INDEX UQ_companies_name
    ON companies(name);
END;
GO
