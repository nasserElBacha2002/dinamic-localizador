-- 106: Geocoding metadata for location_zones (centroids already exist).
-- Fresh-database path: also adds integrity CHECKs for RESOLVED/MANUAL centroids
-- and status/source coherence (same constraints as 107).
-- Installs that already applied an older 106 without those CHECKs get them via 107.
-- No HTTP / geocoding in this migration — backfill is a separate CLI.
-- Rollback: database/migrations/rollback/106_location_zones_geocoding_rollback.sql

USE dinamic_attendance;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoding_status') IS NULL
BEGIN
    ALTER TABLE dbo.location_zones
        ADD geocoding_status NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoding_source') IS NULL
BEGIN
    ALTER TABLE dbo.location_zones
        ADD geocoding_source NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoded_at') IS NULL
BEGIN
    ALTER TABLE dbo.location_zones
        ADD geocoded_at DATETIME2 NULL;
END;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoding_last_error') IS NULL
BEGIN
    ALTER TABLE dbo.location_zones
        ADD geocoding_last_error NVARCHAR(500) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_status'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones
        ADD CONSTRAINT CK_location_zones_geocoding_status CHECK (
            geocoding_status IS NULL
            OR geocoding_status IN (N'PENDING', N'RESOLVED', N'FAILED', N'MANUAL')
        );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_source'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones
        ADD CONSTRAINT CK_location_zones_geocoding_source CHECK (
            geocoding_source IS NULL
            OR geocoding_source IN (N'AUTO', N'MANUAL')
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_location_zones_company_geocoding_status'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    CREATE INDEX IX_location_zones_company_geocoding_status
        ON dbo.location_zones (company_id, geocoding_status)
        INCLUDE (centroid_latitude, centroid_longitude, geocoding_source);
END;
GO

-- Historical centroids predate this pipeline; treat as MANUAL so AUTO backfill
-- does not overwrite operator-known coordinates. No HTTP in this migration.
UPDATE dbo.location_zones
SET
    geocoding_status = N'MANUAL',
    geocoding_source = N'MANUAL',
    geocoded_at = COALESCE(geocoded_at, updated_at),
    geocoding_last_error = NULL
WHERE centroid_latitude IS NOT NULL
  AND centroid_longitude IS NOT NULL
  AND geocoding_status IS NULL;
GO

-- Domain integrity: RESOLVED/MANUAL must have a usable centroid pair.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_status_requires_centroid'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones
        ADD CONSTRAINT CK_location_zones_geocoding_status_requires_centroid CHECK (
            geocoding_status IS NULL
            OR geocoding_status NOT IN (N'RESOLVED', N'MANUAL')
            OR (
                centroid_latitude IS NOT NULL
                AND centroid_longitude IS NOT NULL
            )
        );
END;
GO

-- Domain integrity: status/source coherence for resolved geocoding outcomes.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_status_source_coherence'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones
        ADD CONSTRAINT CK_location_zones_geocoding_status_source_coherence CHECK (
            (
                geocoding_status IS NULL
                OR geocoding_status <> N'MANUAL'
                OR geocoding_source = N'MANUAL'
            )
            AND (
                geocoding_status IS NULL
                OR geocoding_status <> N'RESOLVED'
                OR geocoding_source = N'AUTO'
            )
        );
END;
GO
