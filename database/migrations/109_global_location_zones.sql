-- Expand → backfill → validate → switch → contract for global location_zones.
-- Idempotent across re-runs: each phase guards on schema state (company_id presence).
-- Geographic identity: dbo.fn_normalize_location_zone_text (mirrors Node normalizeLocationZoneName).
-- Rollback (manual): restore company_id, drop company_location_zones / fn.

USE dinamic_attendance;
GO

-- -------------------------------------------------------------------------
-- 0. Canonical normalize function (Node-equivalent for Spanish Latin text)
-- -------------------------------------------------------------------------
CREATE OR ALTER FUNCTION dbo.fn_normalize_location_zone_text (@value NVARCHAR(120))
RETURNS NVARCHAR(120)
WITH SCHEMABINDING
AS
BEGIN
    DECLARE @s NVARCHAR(120) = LTRIM(RTRIM(ISNULL(@value, N'')));

    WHILE CHARINDEX(N'  ', @s) > 0
    BEGIN
        SET @s = REPLACE(@s, N'  ', N' ');
    END;

    SET @s = TRANSLATE(
        @s,
        N'ÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇÝáàäâãåéèëêíìïîóòöôõúùüûñçý',
        N'AAAAAAEEEEIIIIOOOOOUUUUNCYAAAAAAEEEEIIIIOOOOOUUUUNCY'
    );

    RETURN LOWER(@s);
END;
GO

-- -------------------------------------------------------------------------
-- 1. EXPAND: association table (safe if re-run)
-- -------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.company_location_zones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.company_location_zones (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_company_location_zones PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        location_zone_id UNIQUEIDENTIFIER NOT NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_company_location_zones_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_company_location_zones_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_company_location_zones_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_company_location_zones_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT FK_company_location_zones_zone
            FOREIGN KEY (location_zone_id) REFERENCES dbo.location_zones (id),
        CONSTRAINT UQ_company_location_zones_company_zone
            UNIQUE (company_id, location_zone_id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_company_location_zones_zone'
      AND object_id = OBJECT_ID(N'dbo.company_location_zones')
)
BEGIN
    CREATE INDEX IX_company_location_zones_zone
        ON dbo.company_location_zones (location_zone_id)
        INCLUDE (company_id, is_active);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_company_location_zones_company_active'
      AND object_id = OBJECT_ID(N'dbo.company_location_zones')
)
BEGIN
    CREATE INDEX IX_company_location_zones_company_active
        ON dbo.company_location_zones (company_id, is_active)
        INCLUDE (location_zone_id);
END;
GO

-- -------------------------------------------------------------------------
-- 2. Recanonicalize persisted keys BEFORE unique/consolidation (company_id may still exist)
-- -------------------------------------------------------------------------
UPDATE dbo.location_zones
SET
    normalized_name = dbo.fn_normalize_location_zone_text(name),
    normalized_locality = dbo.fn_normalize_location_zone_text(ISNULL(locality, N'')),
    updated_at = SYSUTCDATETIME()
WHERE
    normalized_name <> dbo.fn_normalize_location_zone_text(name)
    OR normalized_locality <> dbo.fn_normalize_location_zone_text(ISNULL(locality, N''));
GO

-- -------------------------------------------------------------------------
-- 3. VALIDATE: abort on incompatible MANUAL centroids for the same identity
-- -------------------------------------------------------------------------
IF EXISTS (
    SELECT 1
    FROM dbo.location_zones a
    INNER JOIN dbo.location_zones b
        ON a.normalized_name = b.normalized_name
       AND a.normalized_locality = b.normalized_locality
       AND a.id < b.id
    WHERE (a.geocoding_status = N'MANUAL' OR a.geocoding_source = N'MANUAL')
      AND (b.geocoding_status = N'MANUAL' OR b.geocoding_source = N'MANUAL')
      AND a.centroid_latitude IS NOT NULL
      AND a.centroid_longitude IS NOT NULL
      AND b.centroid_latitude IS NOT NULL
      AND b.centroid_longitude IS NOT NULL
      AND (
            ABS(CAST(a.centroid_latitude AS FLOAT) - CAST(b.centroid_latitude AS FLOAT)) > 0.00001
         OR ABS(CAST(a.centroid_longitude AS FLOAT) - CAST(b.centroid_longitude AS FLOAT)) > 0.00001
      )
)
BEGIN
    DECLARE @conflictMsg NVARCHAR(400) = N'MIGRATION_109_MANUAL_CENTROID_CONFLICT: multiple MANUAL centroids for the same normalized location key. Resolve manually before consolidating.';
    THROW 50091, @conflictMsg, 1;
END;
GO

-- -------------------------------------------------------------------------
-- 4. BACKFILL associations (only while company_id still exists)
-- -------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.location_zones')
      AND name = N'company_id'
)
BEGIN
    INSERT INTO dbo.company_location_zones (company_id, location_zone_id, is_active, created_at, updated_at)
    SELECT
        lz.company_id,
        lz.id,
        lz.is_active,
        lz.created_at,
        lz.updated_at
    FROM dbo.location_zones lz
    WHERE lz.company_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.company_location_zones clz
          WHERE clz.company_id = lz.company_id
            AND clz.location_zone_id = lz.id
      );
END;
GO

-- -------------------------------------------------------------------------
-- 4b. Drop legacy same-company triggers BEFORE remapping.
-- Cross-company survivor remaps would fail under the old company_id checks.
-- New association-scoped triggers are created after CONTRACT.
-- -------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TR_employees_location_zone_company_scope', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_employees_location_zone_company_scope;
GO

IF OBJECT_ID(N'dbo.TR_operational_locations_location_zone_company_scope', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_operational_locations_location_zone_company_scope;
GO

-- -------------------------------------------------------------------------
-- 5. SWITCH: consolidate duplicates + remap FKs
-- Permanent staging tables (not #temp): node-mssql applies each GO batch as a
-- separate Request; session #temp tables are not reliably visible across them.
-- -------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.__mig109_zone_survivors', N'U') IS NOT NULL
    DROP TABLE dbo.__mig109_zone_survivors;
IF OBJECT_ID(N'dbo.__mig109_zone_remap', N'U') IS NOT NULL
    DROP TABLE dbo.__mig109_zone_remap;
GO

;WITH ranked AS (
    SELECT
        lz.id,
        lz.normalized_name,
        lz.normalized_locality,
        ROW_NUMBER() OVER (
            PARTITION BY lz.normalized_name, lz.normalized_locality
            ORDER BY
                CASE
                    WHEN lz.geocoding_status = N'MANUAL'
                      OR lz.geocoding_source = N'MANUAL' THEN 0
                    WHEN lz.geocoding_status = N'RESOLVED' THEN 1
                    WHEN lz.centroid_latitude IS NOT NULL
                     AND lz.centroid_longitude IS NOT NULL THEN 2
                    ELSE 3
                END ASC,
                lz.created_at ASC,
                lz.id ASC
        ) AS rn
    FROM dbo.location_zones lz
)
SELECT
    r.id AS survivor_id,
    r.normalized_name,
    r.normalized_locality
INTO dbo.__mig109_zone_survivors
FROM ranked r
WHERE r.rn = 1;
GO

SELECT
    lz.id AS old_id,
    s.survivor_id
INTO dbo.__mig109_zone_remap
FROM dbo.location_zones lz
INNER JOIN dbo.__mig109_zone_survivors s
    ON s.normalized_name = lz.normalized_name
   AND s.normalized_locality = lz.normalized_locality
WHERE lz.id <> s.survivor_id;
GO

UPDATE e
SET location_zone_id = r.survivor_id,
    updated_at = SYSUTCDATETIME()
FROM dbo.employees e
INNER JOIN dbo.__mig109_zone_remap r ON r.old_id = e.location_zone_id;
GO

UPDATE ol
SET location_zone_id = r.survivor_id,
    updated_at = SYSUTCDATETIME()
FROM dbo.operational_locations ol
INNER JOIN dbo.__mig109_zone_remap r ON r.old_id = ol.location_zone_id;
GO

UPDATE clz
SET location_zone_id = r.survivor_id,
    updated_at = SYSUTCDATETIME()
FROM dbo.company_location_zones clz
INNER JOIN dbo.__mig109_zone_remap r ON r.old_id = clz.location_zone_id
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.company_location_zones existing
    WHERE existing.company_id = clz.company_id
      AND existing.location_zone_id = r.survivor_id
);
GO

UPDATE survivor
SET is_active = 1,
    updated_at = SYSUTCDATETIME()
FROM dbo.company_location_zones survivor
INNER JOIN dbo.company_location_zones dup
    ON dup.company_id = survivor.company_id
INNER JOIN dbo.__mig109_zone_remap r
    ON r.old_id = dup.location_zone_id
   AND r.survivor_id = survivor.location_zone_id
WHERE dup.is_active = 1
  AND survivor.is_active = 0;
GO

DELETE clz
FROM dbo.company_location_zones clz
INNER JOIN dbo.__mig109_zone_remap r ON r.old_id = clz.location_zone_id;
GO

DELETE lz
FROM dbo.location_zones lz
INNER JOIN dbo.__mig109_zone_remap r ON r.old_id = lz.id;
GO

IF OBJECT_ID(N'dbo.__mig109_zone_remap', N'U') IS NOT NULL
    DROP TABLE dbo.__mig109_zone_remap;
IF OBJECT_ID(N'dbo.__mig109_zone_survivors', N'U') IS NOT NULL
    DROP TABLE dbo.__mig109_zone_survivors;
GO

-- -------------------------------------------------------------------------
-- 6. CONTRACT: drop company_id + company-scoped indexes (idempotent)
-- -------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_location_zones_company_normalized_name_locality'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    DROP INDEX UQ_location_zones_company_normalized_name_locality ON dbo.location_zones;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_location_zones_company_active'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    DROP INDEX IX_location_zones_company_active ON dbo.location_zones;
END;
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
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_location_zones_company'
      AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    ALTER TABLE dbo.location_zones DROP CONSTRAINT FK_location_zones_company;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.location_zones')
      AND name = N'company_id'
)
BEGIN
    ALTER TABLE dbo.location_zones DROP COLUMN company_id;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_location_zones_normalized_name_locality'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    CREATE UNIQUE INDEX UQ_location_zones_normalized_name_locality
        ON dbo.location_zones (normalized_name, normalized_locality);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_location_zones_active_name'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    CREATE INDEX IX_location_zones_active_name
        ON dbo.location_zones (is_active, normalized_name)
        INCLUDE (name, locality, normalized_locality);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_location_zones_geocoding_status'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    CREATE INDEX IX_location_zones_geocoding_status
        ON dbo.location_zones (geocoding_status)
        INCLUDE (is_active, name, locality);
END;
GO

-- -------------------------------------------------------------------------
-- 7. Triggers: active association required only for NEW assignments
--    (INSERT, or UPDATE that changes location_zone_id / company_id).
--    Historical refs may remain when association is later deactivated.
-- -------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TR_employees_location_zone_company_scope', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_employees_location_zone_company_scope;
GO

EXEC(N'
CREATE TRIGGER dbo.TR_employees_location_zone_company_scope
ON dbo.employees
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted)
        RETURN;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        LEFT JOIN deleted d ON d.id = i.id
        WHERE i.location_zone_id IS NOT NULL
          AND (
                d.id IS NULL
             OR ISNULL(i.location_zone_id, ''00000000-0000-0000-0000-000000000000'')
                <> ISNULL(d.location_zone_id, ''00000000-0000-0000-0000-000000000000'')
             OR i.company_id <> d.company_id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.company_location_zones clz
              INNER JOIN dbo.location_zones lz ON lz.id = clz.location_zone_id
              WHERE clz.location_zone_id = i.location_zone_id
                AND clz.company_id = i.company_id
                AND clz.is_active = 1
                AND lz.is_active = 1
          )
    )
    BEGIN
        THROW 50061, ''EMPLOYEE_LOCATION_ZONE_NOT_ENABLED: location_zone_id must be enabled for the employee company when newly assigned.'', 1;
    END;
END;
');
GO

IF OBJECT_ID(N'dbo.TR_operational_locations_location_zone_company_scope', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_operational_locations_location_zone_company_scope;
GO

EXEC(N'
CREATE TRIGGER dbo.TR_operational_locations_location_zone_company_scope
ON dbo.operational_locations
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted)
        RETURN;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        LEFT JOIN deleted d ON d.id = i.id
        WHERE i.location_zone_id IS NOT NULL
          AND (
                d.id IS NULL
             OR ISNULL(i.location_zone_id, ''00000000-0000-0000-0000-000000000000'')
                <> ISNULL(d.location_zone_id, ''00000000-0000-0000-0000-000000000000'')
             OR i.company_id <> d.company_id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.company_location_zones clz
              INNER JOIN dbo.location_zones lz ON lz.id = clz.location_zone_id
              WHERE clz.location_zone_id = i.location_zone_id
                AND clz.company_id = i.company_id
                AND clz.is_active = 1
                AND lz.is_active = 1
          )
    )
    BEGIN
        THROW 50001, N''location_zone_id must be enabled for the service company when newly assigned'', 1;
    END;
END;
');
GO
