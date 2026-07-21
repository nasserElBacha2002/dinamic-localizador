-- Harden operational_locations for list filters, facets, and format length consistency.
-- 1) Widen store_format to NVARCHAR(80) to match company_location_types.code
-- 2) Trim historical text fields and convert empty strings to NULL
-- 3) Add company-scoped indexes for list/facet query patterns
--
-- Case comparisons rely on the database collation (typically case-insensitive);
-- application code preserves original casing and does not force UPPER/LOWER.
--
-- Rollback (manual):
--   DROP INDEX IF EXISTS IX_operational_locations_company_active_created ON dbo.operational_locations;
--   DROP INDEX IF EXISTS IX_operational_locations_company_locality_neighborhood ON dbo.operational_locations;
--   DROP INDEX IF EXISTS IX_operational_locations_company_store_format ON dbo.operational_locations;
--   ALTER TABLE dbo.operational_locations ALTER COLUMN store_format NVARCHAR(50) NULL;
--   (trimmed historical values are not restored)

USE dinamic_attendance;
GO

-- ---------------------------------------------------------------------------
-- Widen store_format to NVARCHAR(80)
-- ---------------------------------------------------------------------------
IF EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.operational_locations')
      AND c.name = N'store_format'
      AND t.name = N'nvarchar'
      AND c.max_length < 160 -- nvarchar length is bytes (80 chars = 160)
)
BEGIN
    ALTER TABLE dbo.operational_locations
        ALTER COLUMN store_format NVARCHAR(80) NULL;
END;
GO

-- ---------------------------------------------------------------------------
-- Normalize historical optional text fields (trim + empty → NULL)
-- ---------------------------------------------------------------------------
UPDATE dbo.operational_locations
SET
    address = CASE
        WHEN address IS NULL THEN NULL
        WHEN LTRIM(RTRIM(address)) = N'' THEN NULL
        ELSE LTRIM(RTRIM(address))
    END,
    neighborhood = CASE
        WHEN neighborhood IS NULL THEN NULL
        WHEN LTRIM(RTRIM(neighborhood)) = N'' THEN NULL
        ELSE LTRIM(RTRIM(neighborhood))
    END,
    locality = CASE
        WHEN locality IS NULL THEN NULL
        WHEN LTRIM(RTRIM(locality)) = N'' THEN NULL
        ELSE LTRIM(RTRIM(locality))
    END,
    store_format = CASE
        WHEN store_format IS NULL THEN NULL
        WHEN LTRIM(RTRIM(store_format)) = N'' THEN NULL
        ELSE LTRIM(RTRIM(store_format))
    END
WHERE
    (address IS NOT NULL AND (address LIKE N' %' OR address LIKE N'% ' OR LTRIM(RTRIM(address)) = N''))
    OR (neighborhood IS NOT NULL AND (neighborhood LIKE N' %' OR neighborhood LIKE N'% ' OR LTRIM(RTRIM(neighborhood)) = N''))
    OR (locality IS NOT NULL AND (locality LIKE N' %' OR locality LIKE N'% ' OR LTRIM(RTRIM(locality)) = N''))
    OR (store_format IS NOT NULL AND (store_format LIKE N' %' OR store_format LIKE N'% ' OR LTRIM(RTRIM(store_format)) = N''));
GO

-- ---------------------------------------------------------------------------
-- Indexes justified by list/facet access patterns:
--   - default list: company_id + active + created_at DESC (+ id tie-break in query)
--   - locality/neighborhood filters and facets: company_id + locality + neighborhood
--   - format filter: company_id + store_format
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_operational_locations_company_active_created'
      AND object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    CREATE INDEX IX_operational_locations_company_active_created
        ON dbo.operational_locations (company_id, active, created_at DESC, id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_operational_locations_company_locality_neighborhood'
      AND object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    CREATE INDEX IX_operational_locations_company_locality_neighborhood
        ON dbo.operational_locations (company_id, locality, neighborhood)
        WHERE locality IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_operational_locations_company_store_format'
      AND object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    CREATE INDEX IX_operational_locations_company_store_format
        ON dbo.operational_locations (company_id, store_format)
        WHERE store_format IS NOT NULL;
END;
GO
