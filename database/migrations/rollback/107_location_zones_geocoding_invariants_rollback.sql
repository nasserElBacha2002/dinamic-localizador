-- Rollback 107: drop additive geocoding integrity constraints.

USE dinamic_attendance;
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
