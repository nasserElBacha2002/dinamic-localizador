-- Harden operational location name uniqueness per company.
-- Complements 048 by:
--   1) removing any legacy name-only UNIQUE constraint/index on dbo.operational_locations
--   2) auditing duplicates with trim-compatible normalization (LTRIM/RTRIM)
--   3) ensuring UQ_operational_locations_company_id_name exists
--   4) failing if any name-only unique key still remains
--
-- Rollback:
--   DROP INDEX UQ_operational_locations_company_id_name ON dbo.operational_locations;
--   (do not recreate dropped name-only unique indexes)

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- Drop unique constraints/indexes whose effective key is ONLY the name column.
-- ---------------------------------------------------------------------------
DECLARE @dropSql NVARCHAR(MAX) = N'';

;WITH name_only_unique AS (
    SELECT
        i.object_id,
        i.index_id,
        i.name AS index_name,
        i.is_unique_constraint
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.operational_locations')
      AND i.is_unique = 1
      AND i.is_primary_key = 0
      AND i.name IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name <> N'name'
      )
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name = N'name'
      )
      AND (
          SELECT COUNT(*)
          FROM sys.index_columns ic
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
      ) = 1
)
SELECT @dropSql = @dropSql + CASE
    WHEN is_unique_constraint = 1 THEN
        N'ALTER TABLE dbo.operational_locations DROP CONSTRAINT ' + QUOTENAME(index_name) + N';'
    ELSE
        N'DROP INDEX ' + QUOTENAME(index_name) + N' ON dbo.operational_locations;'
END + CHAR(10)
FROM name_only_unique;

IF LEN(@dropSql) > 0
BEGIN
    EXEC sp_executesql @dropSql;
END;
GO

-- ---------------------------------------------------------------------------
-- Trim-compatible duplicate precondition (matches backend input.name.trim()).
-- Does not mutate historical rows.
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1
    FROM (
        SELECT
            company_id,
            LTRIM(RTRIM(name)) AS normalized_name,
            COUNT(*) AS duplicate_count
        FROM dbo.operational_locations
        GROUP BY company_id, LTRIM(RTRIM(name))
        HAVING COUNT(*) > 1
    ) duplicates
)
BEGIN
    THROW 51000, 'Cannot enforce operational location name uniqueness: duplicate names exist within the same company after trimming whitespace.', 1;
END;
GO

-- ---------------------------------------------------------------------------
-- Ensure company-scoped unique index exists (idempotent with migration 048).
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UQ_operational_locations_company_id_name'
      AND object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    CREATE UNIQUE INDEX UQ_operational_locations_company_id_name
    ON dbo.operational_locations (company_id, name);
END;
GO

-- ---------------------------------------------------------------------------
-- Postcondition: no name-only unique key/index may remain.
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.operational_locations')
      AND i.is_unique = 1
      AND i.is_primary_key = 0
      AND i.name IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name <> N'name'
      )
      AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic
          INNER JOIN sys.columns c
              ON c.object_id = ic.object_id
             AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
            AND c.name = N'name'
      )
      AND (
          SELECT COUNT(*)
          FROM sys.index_columns ic
          WHERE ic.object_id = i.object_id
            AND ic.index_id = i.index_id
            AND ic.is_included_column = 0
      ) = 1
)
BEGIN
    THROW 51000, 'Migration failed: global operational location name uniqueness still exists on dbo.operational_locations.', 1;
END;
GO

-- ---------------------------------------------------------------------------
-- Postcondition: company-scoped unique index must exist with expected keys.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.operational_locations')
      AND i.name = N'UQ_operational_locations_company_id_name'
      AND i.is_unique = 1
)
BEGIN
    THROW 51000, 'Migration failed: UQ_operational_locations_company_id_name is missing.', 1;
END;
GO
