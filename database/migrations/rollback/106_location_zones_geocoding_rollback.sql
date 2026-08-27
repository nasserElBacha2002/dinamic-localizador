-- Rollback 106: drop location_zones geocoding metadata columns / constraints / index.

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_location_zones_company_geocoding_status'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    DROP INDEX IX_location_zones_company_geocoding_status ON dbo.location_zones;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_status_source_coherence'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones DROP CONSTRAINT CK_location_zones_geocoding_status_source_coherence;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_status_requires_centroid'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones DROP CONSTRAINT CK_location_zones_geocoding_status_requires_centroid;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_status'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones DROP CONSTRAINT CK_location_zones_geocoding_status;
END;
GO

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_location_zones_geocoding_source'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones DROP CONSTRAINT CK_location_zones_geocoding_source;
END;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoding_last_error') IS NOT NULL
BEGIN
    ALTER TABLE dbo.location_zones DROP COLUMN geocoding_last_error;
END;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoded_at') IS NOT NULL
BEGIN
    ALTER TABLE dbo.location_zones DROP COLUMN geocoded_at;
END;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoding_source') IS NOT NULL
BEGIN
    ALTER TABLE dbo.location_zones DROP COLUMN geocoding_source;
END;
GO

IF COL_LENGTH(N'dbo.location_zones', N'geocoding_status') IS NOT NULL
BEGIN
    ALTER TABLE dbo.location_zones DROP COLUMN geocoding_status;
END;
GO
