-- Enforce operational location (service/store) name uniqueness per company.
-- Physical table: operational_locations (legacy: stores).
-- Rollback:
--   DROP INDEX UQ_operational_locations_company_id_name ON dbo.operational_locations;

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT company_id, name
    FROM dbo.operational_locations
    GROUP BY company_id, name
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51000, 'Cannot create unique operational location name index: duplicate names exist within the same company.', 1;
END;
GO

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
