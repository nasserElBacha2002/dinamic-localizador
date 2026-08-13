-- Phase 0 AI foundation: company-scoped approximate residence zones for employees.
-- Does NOT store exact home addresses. Centroids are optional zone approximations only.
-- Rollback (manual):
--   DROP TRIGGER TR_employees_location_zone_company_scope;
--   drop FK/indexes/column employees.location_zone_id;
--   then drop location_zones.

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.location_zones', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.location_zones (
        id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_location_zones PRIMARY KEY DEFAULT NEWID(),
        company_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(120) NOT NULL,
        normalized_name NVARCHAR(120) NOT NULL,
        locality NVARCHAR(120) NULL,
        normalized_locality NVARCHAR(120) NOT NULL
            CONSTRAINT DF_location_zones_normalized_locality DEFAULT N'',
        centroid_latitude DECIMAL(10, 7) NULL,
        centroid_longitude DECIMAL(10, 7) NULL,
        is_active BIT NOT NULL
            CONSTRAINT DF_location_zones_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL
            CONSTRAINT DF_location_zones_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_location_zones_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_location_zones_company
            FOREIGN KEY (company_id) REFERENCES dbo.companies (id),
        CONSTRAINT CK_location_zones_centroid_pair CHECK (
            (centroid_latitude IS NULL AND centroid_longitude IS NULL)
            OR (centroid_latitude IS NOT NULL AND centroid_longitude IS NOT NULL)
        ),
        CONSTRAINT CK_location_zones_centroid_latitude CHECK (
            centroid_latitude IS NULL OR (centroid_latitude >= -90 AND centroid_latitude <= 90)
        ),
        CONSTRAINT CK_location_zones_centroid_longitude CHECK (
            centroid_longitude IS NULL OR (centroid_longitude >= -180 AND centroid_longitude <= 180)
        )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_location_zones_company_normalized_name_locality'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    CREATE UNIQUE INDEX UQ_location_zones_company_normalized_name_locality
        ON dbo.location_zones (company_id, normalized_name, normalized_locality);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_location_zones_company_active'
      AND object_id = OBJECT_ID(N'dbo.location_zones')
)
BEGIN
    CREATE INDEX IX_location_zones_company_active
        ON dbo.location_zones (company_id, is_active)
        INCLUDE (name, locality, normalized_name, normalized_locality);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.employees')
      AND name = N'location_zone_id'
)
BEGIN
    ALTER TABLE dbo.employees
        ADD location_zone_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_employees_location_zone'
      AND parent_object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    ALTER TABLE dbo.employees
        ADD CONSTRAINT FK_employees_location_zone
        FOREIGN KEY (location_zone_id) REFERENCES dbo.location_zones (id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_employees_company_location_zone'
      AND object_id = OBJECT_ID(N'dbo.employees')
)
BEGIN
    CREATE INDEX IX_employees_company_location_zone
        ON dbo.employees (company_id, location_zone_id)
        INCLUDE (name, active);
END;
GO

IF OBJECT_ID(N'dbo.TR_employees_location_zone_company_scope', N'TR') IS NULL
BEGIN
    EXEC(N'
    CREATE TRIGGER dbo.TR_employees_location_zone_company_scope
    ON dbo.employees
    AFTER INSERT, UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM inserted)
        BEGIN
            RETURN;
        END;

        IF EXISTS (
            SELECT 1
            FROM inserted i
            WHERE i.location_zone_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.location_zones lz
                  WHERE lz.id = i.location_zone_id
                    AND lz.company_id = i.company_id
              )
        )
        BEGIN
            THROW 50061, ''EMPLOYEE_LOCATION_ZONE_CROSS_COMPANY: location_zone_id must belong to the employee company.'', 1;
        END;
    END;
    ');
END;
GO
