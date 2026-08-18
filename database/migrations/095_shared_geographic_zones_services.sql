-- Phase 1 corrections: shared geographic zones for services + employees.
-- location_zones remains the company-scoped catalog (barrio = name, localidad = locality).
-- Services gain location_zone_id FK; neighborhood/locality stay as denormalized legacy mirrors.
-- Centroids are NOT backfilled from service coordinates.
--
-- Scope decision: company-scoped (not global) to preserve tenant isolation and current RBAC.
-- Rollback (manual): drop trigger/FK/column on operational_locations.

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.operational_locations')
      AND name = N'location_zone_id'
)
BEGIN
    ALTER TABLE dbo.operational_locations
        ADD location_zone_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_operational_locations_location_zone'
)
BEGIN
    ALTER TABLE dbo.operational_locations
        ADD CONSTRAINT FK_operational_locations_location_zone
        FOREIGN KEY (location_zone_id) REFERENCES dbo.location_zones (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_operational_locations_company_location_zone'
      AND object_id = OBJECT_ID(N'dbo.operational_locations')
)
BEGIN
    CREATE INDEX IX_operational_locations_company_location_zone
        ON dbo.operational_locations (company_id, location_zone_id)
        INCLUDE (name, neighborhood, locality, active);
END;
GO

-- Backfill: create missing zones from distinct service neighborhood+locality pairs.
;WITH service_keys AS (
    SELECT DISTINCT
        ol.company_id,
        LTRIM(RTRIM(ol.neighborhood)) AS name,
        LOWER(LTRIM(RTRIM(ol.neighborhood))) AS normalized_name,
        CASE
            WHEN ol.locality IS NULL OR LTRIM(RTRIM(ol.locality)) = N'' THEN NULL
            ELSE LTRIM(RTRIM(ol.locality))
        END AS locality,
        CASE
            WHEN ol.locality IS NULL OR LTRIM(RTRIM(ol.locality)) = N'' THEN N''
            ELSE LOWER(LTRIM(RTRIM(ol.locality)))
        END AS normalized_locality
    FROM dbo.operational_locations ol
    WHERE ol.neighborhood IS NOT NULL
      AND LTRIM(RTRIM(ol.neighborhood)) <> N''
)
INSERT INTO dbo.location_zones (
    company_id, name, normalized_name, locality, normalized_locality, is_active
)
SELECT
    sk.company_id,
    sk.name,
    sk.normalized_name,
    sk.locality,
    sk.normalized_locality,
    1
FROM service_keys sk
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.location_zones lz
    WHERE lz.company_id = sk.company_id
      AND lz.normalized_name = sk.normalized_name
      AND lz.normalized_locality = sk.normalized_locality
);
GO

-- Link services to matching zones (employee zones included via same unique key).
UPDATE ol
SET location_zone_id = lz.id,
    updated_at = SYSUTCDATETIME()
FROM dbo.operational_locations ol
INNER JOIN dbo.location_zones lz
    ON lz.company_id = ol.company_id
   AND lz.normalized_name = LOWER(LTRIM(RTRIM(ol.neighborhood)))
   AND lz.normalized_locality = CASE
        WHEN ol.locality IS NULL OR LTRIM(RTRIM(ol.locality)) = N'' THEN N''
        ELSE LOWER(LTRIM(RTRIM(ol.locality)))
    END
WHERE ol.location_zone_id IS NULL
  AND ol.neighborhood IS NOT NULL
  AND LTRIM(RTRIM(ol.neighborhood)) <> N'';
GO

-- Cross-company guard for service → zone (mirrors employee trigger).
IF OBJECT_ID(N'dbo.TR_operational_locations_location_zone_company_scope', N'TR') IS NULL
BEGIN
    EXEC(N'
    CREATE TRIGGER dbo.TR_operational_locations_location_zone_company_scope
    ON dbo.operational_locations
    AFTER INSERT, UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;
        IF EXISTS (
            SELECT 1
            FROM inserted i
            INNER JOIN dbo.location_zones lz ON lz.id = i.location_zone_id
            WHERE i.location_zone_id IS NOT NULL
              AND lz.company_id <> i.company_id
        )
        BEGIN
            THROW 50001, N''location_zone_id must belong to the same company as the service'', 1;
            ROLLBACK TRANSACTION;
            RETURN;
        END
    END
    ');
END;
GO
