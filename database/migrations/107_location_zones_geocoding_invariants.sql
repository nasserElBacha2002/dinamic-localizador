-- 107: Forward migration for installs that already applied an *older* 106
-- without geocoding integrity CHECKs.
--
-- Fresh databases: current 106 already adds the same constraints → this file is a
-- safe no-op (IF NOT EXISTS).
-- Upgraded databases: old-106 may lack CK_*_requires_centroid / status_source_coherence
-- → this migration adds them after a deterministic preflight.
--
-- No HTTP. Rollback: database/migrations/rollback/107_location_zones_geocoding_invariants_rollback.sql

USE dinamic_attendance;
GO

-- Preflight: fail with a clear diagnosis before ALTER TABLE if legacy rows would
-- violate the new CHECKs. Prefer an explicit abort over an opaque constraint error.
IF EXISTS (
    SELECT 1
    FROM dbo.location_zones
    WHERE geocoding_status IN (N'RESOLVED', N'MANUAL')
      AND (centroid_latitude IS NULL OR centroid_longitude IS NULL)
)
BEGIN
    DECLARE @missingCentroidCount INT =
        (SELECT COUNT(*) FROM dbo.location_zones
         WHERE geocoding_status IN (N'RESOLVED', N'MANUAL')
           AND (centroid_latitude IS NULL OR centroid_longitude IS NULL));
    DECLARE @missingCentroidMsg NVARCHAR(400) =
        N'Migration 107 aborted: ' + CAST(@missingCentroidCount AS NVARCHAR(20))
        + N' location_zones row(s) have geocoding_status RESOLVED/MANUAL without a centroid pair. '
        + N'Fix or nullify those statuses before re-running.';
    THROW 50071, @missingCentroidMsg, 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.location_zones
    WHERE (
            geocoding_status = N'MANUAL'
            AND (geocoding_source IS NULL OR geocoding_source <> N'MANUAL')
        )
       OR (
            geocoding_status = N'RESOLVED'
            AND (geocoding_source IS NULL OR geocoding_source <> N'AUTO')
        )
)
BEGIN
    DECLARE @incoherentCount INT =
        (SELECT COUNT(*) FROM dbo.location_zones
         WHERE (
                geocoding_status = N'MANUAL'
                AND (geocoding_source IS NULL OR geocoding_source <> N'MANUAL')
            )
           OR (
                geocoding_status = N'RESOLVED'
                AND (geocoding_source IS NULL OR geocoding_source <> N'AUTO')
            ));
    DECLARE @incoherentMsg NVARCHAR(400) =
        N'Migration 107 aborted: ' + CAST(@incoherentCount AS NVARCHAR(20))
        + N' location_zones row(s) have incoherent geocoding_status/geocoding_source '
        + N'(MANUAL↔MANUAL, RESOLVED↔AUTO). Fix before re-running.';
    THROW 50072, @incoherentMsg, 1;
END;
GO

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
